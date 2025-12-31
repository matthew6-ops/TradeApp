import { getBusinessByTwilioNumber, insertEvent, insertSmsConsent } from "../../lib/supabase.js";
import { normalizeE164 } from "../../lib/twilio.js";

function getRequestIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) return forwardedFor.split(",")[0].trim();
  if (Array.isArray(forwardedFor) && forwardedFor[0]) return String(forwardedFor[0]).split(",")[0].trim();
  return req.socket?.remoteAddress || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const { to, phone, consent } = req.body || {};
    if (consent !== true) return res.status(400).json({ error: "Consent must be true" });

    const toNumber = normalizeE164(to);
    const customerPhone = normalizeE164(phone);
    if (!toNumber) return res.status(400).json({ error: "Missing to" });
    if (!customerPhone) return res.status(400).json({ error: "Missing phone" });

    const business = await getBusinessByTwilioNumber(toNumber);
    if (!business) return res.status(404).json({ error: "Unknown Twilio number" });

    const ip = getRequestIp(req);
    const userAgent = String(req.headers["user-agent"] || "") || null;

    await insertSmsConsent({ businessId: business.id, customerPhone, ip, userAgent });
    await insertEvent({
      businessId: business.id,
      type: "sms_opt_in",
      payload: { customerPhone, ip }
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

