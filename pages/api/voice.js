import { getBusinessByTwilioNumber, hasSmsConsent, insertEvent, insertSmsConsent } from "../../lib/supabase.js";
import { VoiceResponse, normalizeE164, twilioClient, getBaseUrl, validateTwilioSignatureIfEnabled } from "../../lib/twilio.js";
import { parseUrlEncoded, readRawBody } from "../../lib/twilioBody.js";

export const config = {
  api: { bodyParser: false }
};

async function requireBusinessByToNumber(toNumber, res) {
  const to = normalizeE164(toNumber);
  if (!to) {
    res.status(400).send("Missing To");
    return null;
  }
  const business = await getBusinessByTwilioNumber(to);
  if (!business) {
    res.status(404).send("Unknown Twilio number (no tenant configured)");
    return null;
  }
  return business;
}

// Twilio Voice webhook (serverless).
// Multi-tenant routing: Twilio `To` number -> `businesses.twilio_number` -> owner + SMS-from number.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const raw = await readRawBody(req);
    const body = parseUrlEncoded(raw);

    if (!validateTwilioSignatureIfEnabled({ req, params: body })) return res.status(403).send("Invalid Twilio signature");

    const url = new URL(req.url, "http://localhost");
    const stage = String(url.searchParams.get("stage") || "incoming");

    const toNumber = body.To;
    const fromNumber = body.From;
    const callSid = body.CallSid;

    const business = await requireBusinessByToNumber(toNumber, res);
    if (!business) return;

    if (stage === "incoming") {
      await insertEvent({
        businessId: business.id,
        type: "incoming_call",
        payload: { callSid, from: fromNumber, to: toNumber }
      });

      const base = getBaseUrl(req);
      const dialUrl = base ? `${base}/api/voice?stage=dial` : "/api/voice?stage=dial";
      const consentUrl = base ? `${base}/api/voice?stage=consent` : "/api/voice?stage=consent";

      const customerPhone = normalizeE164(fromNumber);
      const alreadyConsented = customerPhone ? await hasSmsConsent({ businessId: business.id, customerPhone }) : false;

      const twiml = new VoiceResponse();
      if (alreadyConsented) {
        twiml.redirect({ method: "POST" }, dialUrl);
      } else {
        const gather = twiml.gather({ numDigits: 1, timeout: 5, action: consentUrl, method: "POST" });
        gather.say(
          `Press 1 to opt in to receive a single text message from ${business.name} if we miss your call. ` +
            "Message and data rates may apply. Reply STOP to opt out."
        );
        twiml.redirect({ method: "POST" }, dialUrl);
      }

      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml.toString());
      return;
    }

    if (stage === "consent") {
      const digits = String(body.Digits || "");
      const customerPhone = normalizeE164(fromNumber);

      if (digits === "1" && customerPhone) {
        await insertSmsConsent({
          businessId: business.id,
          customerPhone,
          ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || null,
          userAgent: String(req.headers["user-agent"] || "") || null
        });

        await insertEvent({
          businessId: business.id,
          type: "sms_opt_in",
          payload: { callSid, from: customerPhone, via: "voice_gather" }
        });
      }

      const base = getBaseUrl(req);
      const dialUrl = base ? `${base}/api/voice?stage=dial` : "/api/voice?stage=dial";
      const twiml = new VoiceResponse();
      twiml.redirect({ method: "POST" }, dialUrl);
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml.toString());
      return;
    }

    if (stage === "dial") {
      const base = getBaseUrl(req);
      const actionUrl = base ? `${base}/api/voice?stage=dial_end` : "/api/voice?stage=dial_end";

      const twiml = new VoiceResponse();
      const dial = twiml.dial({ action: actionUrl, method: "POST", timeout: 20 });
      dial.number({}, business.owner_phone);

      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml.toString());
      return;
    }

    if (stage === "dial_end") {
      const dialStatus = String(body.DialCallStatus || "");
      const missed = ["no-answer", "busy", "failed", "canceled"].includes(dialStatus);

      await insertEvent({
        businessId: business.id,
        type: missed ? "missed_call" : "call_answered",
        payload: { callSid, from: fromNumber, to: toNumber, dialStatus }
      });

      if (missed) {
        const customerPhone = normalizeE164(fromNumber);
        const consented = customerPhone ? await hasSmsConsent({ businessId: business.id, customerPhone }) : false;

        if (consented) {
          const autoTextBody =
            "Sorry we missed your call — what do you need help with? Reply with the job + address. Reply STOP to opt out.";

          await twilioClient.messages.create({
            to: customerPhone,
            from: normalizeE164(business.twilio_number),
            body: autoTextBody
          });

          await insertEvent({
            businessId: business.id,
            type: "auto_text_sent",
            payload: { callSid, toCustomer: customerPhone, fromBusiness: business.twilio_number }
          });
        } else {
          await insertEvent({
            businessId: business.id,
            type: "auto_text_skipped_no_consent",
            payload: { callSid, toCustomer: customerPhone, fromBusiness: business.twilio_number }
          });
        }
      }

      const twiml = new VoiceResponse();
      twiml.hangup();
      res.setHeader("Content-Type", "text/xml");
      res.status(200).send(twiml.toString());
      return;
    }

    res.status(400).send("Unknown stage");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
}
