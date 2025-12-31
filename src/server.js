import express from "express";
import { env } from "./env.js";
import { getBusinessByTwilioNumber, insertEvent, upsertLeadForInboundSms } from "./supabase.js";
import { MessagingResponse, VoiceResponse, twilioClient, validateTwilioSignatureIfEnabled } from "./twilio.js";

const app = express();

// Twilio webhooks send x-www-form-urlencoded payloads.
app.use(express.urlencoded({ extended: false }));

app.get("/health", (_req, res) => res.json({ ok: true }));

function normalizeE164(value) {
  return String(value || "").trim();
}

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

// --- VOICE WEBHOOK ---
//
// Flow (single endpoint with 2 stages):
// 1) Incoming call hits POST /voice
//    - lookup tenant by To (Twilio number)
//    - <Dial> the owner phone
//    - action posts back to /voice?stage=dial_end when dial ends
//
// 2) Twilio posts back POST /voice?stage=dial_end
//    - if DialCallStatus is no-answer/busy/failed/canceled => "missed"
//    - send an auto-text SMS to the caller asking for job + address
//    - log events for reliability/audit
app.post("/voice", async (req, res) => {
  try {
    if (!validateTwilioSignatureIfEnabled(req)) return res.status(403).send("Invalid Twilio signature");

    const stage = String(req.query.stage || "incoming");
    const toNumber = req.body.To;
    const fromNumber = req.body.From;
    const callSid = req.body.CallSid;

    const business = await requireBusinessByToNumber(toNumber, res);
    if (!business) return;

    if (stage === "incoming") {
      await insertEvent({
        businessId: business.id,
        type: "incoming_call",
        payload: { callSid, from: fromNumber, to: toNumber }
      });

      const twiml = new VoiceResponse();
      const dial = twiml.dial({
        action: "/voice?stage=dial_end",
        method: "POST",
        timeout: 20
      });
      dial.number({}, business.owner_phone);

      res.type("text/xml").send(twiml.toString());
      return;
    }

    if (stage === "dial_end") {
      const dialStatus = String(req.body.DialCallStatus || "");
      const missed = ["no-answer", "busy", "failed", "canceled"].includes(dialStatus);

      await insertEvent({
        businessId: business.id,
        type: missed ? "missed_call" : "call_answered",
        payload: { callSid, from: fromNumber, to: toNumber, dialStatus }
      });

      if (missed) {
        const autoTextBody = "Sorry we missed your call — what do you need help with? Reply with the job + address.";

        await twilioClient.messages.create({
          to: normalizeE164(fromNumber),
          from: normalizeE164(business.twilio_number),
          body: autoTextBody
        });

        await insertEvent({
          businessId: business.id,
          type: "auto_text_sent",
          payload: { callSid, toCustomer: fromNumber, fromBusiness: business.twilio_number }
        });
      }

      const twiml = new VoiceResponse();
      twiml.hangup();
      res.type("text/xml").send(twiml.toString());
      return;
    }

    res.status(400).send("Unknown stage");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// --- SMS WEBHOOK ---
//
// Flow:
// - Twilio posts inbound SMS to POST /sms
// - lookup tenant by To (Twilio number)
// - find-or-create lead by (business_id, customer_phone)
// - store last_message + status=open, log inbound_sms event
// - forward details to owner via SMS
// - reply to customer confirming receipt via TwiML
app.post("/sms", async (req, res) => {
  try {
    if (!validateTwilioSignatureIfEnabled(req)) return res.status(403).send("Invalid Twilio signature");

    const toNumber = req.body.To;
    const fromNumber = req.body.From;
    const body = String(req.body.Body || "").trim();
    const messageSid = req.body.MessageSid;

    const business = await requireBusinessByToNumber(toNumber, res);
    if (!business) return;

    const lead = await upsertLeadForInboundSms({
      businessId: business.id,
      customerPhone: normalizeE164(fromNumber),
      lastMessage: body
    });

    await insertEvent({
      businessId: business.id,
      leadId: lead.id,
      type: "inbound_sms",
      payload: { messageSid, from: fromNumber, to: toNumber, body }
    });

    const ownerText =
      `New lead for ${business.name}\n` +
      `From: ${normalizeE164(fromNumber)}\n` +
      `Message: ${body}\n` +
      `Lead ID: ${lead.id}`;

    await twilioClient.messages.create({
      to: normalizeE164(business.owner_phone),
      from: normalizeE164(business.twilio_number),
      body: ownerText
    });

    await insertEvent({
      businessId: business.id,
      leadId: lead.id,
      type: "owner_notified",
      payload: { toOwner: business.owner_phone, fromBusiness: business.twilio_number, messageSid }
    });

    const twiml = new MessagingResponse();
    twiml.message("Got it — thanks! We’ll reach out ASAP.");
    res.type("text/xml").send(twiml.toString());
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.listen(env.port, () => {
  console.log(`Server listening on http://localhost:${env.port}`);
});
