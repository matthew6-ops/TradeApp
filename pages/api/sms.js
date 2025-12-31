import { getBusinessByTwilioNumber, insertEvent, upsertLeadForInboundSms } from "../../lib/supabase.js";
import { MessagingResponse, normalizeE164, twilioClient, validateTwilioSignatureIfEnabled } from "../../lib/twilio.js";
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

// Twilio SMS webhook (serverless).
// Multi-tenant routing: Twilio `To` number -> `businesses.twilio_number` -> lead storage + owner forwarding.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const raw = await readRawBody(req);
    const body = parseUrlEncoded(raw);

    if (!validateTwilioSignatureIfEnabled({ req, params: body })) return res.status(403).send("Invalid Twilio signature");

    const toNumber = body.To;
    const fromNumber = body.From;
    const text = String(body.Body || "").trim();
    const messageSid = body.MessageSid;

    const business = await requireBusinessByToNumber(toNumber, res);
    if (!business) return;

    const lead = await upsertLeadForInboundSms({
      businessId: business.id,
      customerPhone: normalizeE164(fromNumber),
      lastMessage: text
    });

    await insertEvent({
      businessId: business.id,
      leadId: lead.id,
      type: "inbound_sms",
      payload: { messageSid, from: fromNumber, to: toNumber, body: text }
    });

    const ownerText =
      `New lead for ${business.name}\n` +
      `From: ${normalizeE164(fromNumber)}\n` +
      `Message: ${text}\n` +
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
    res.setHeader("Content-Type", "text/xml");
    res.status(200).send(twiml.toString());
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
}

