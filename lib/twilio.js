import twilio from "twilio";
import { env } from "./env.js";

export const twilioClient = twilio(env.twilio.accountSid, env.twilio.authToken);
export const VoiceResponse = twilio.twiml.VoiceResponse;
export const MessagingResponse = twilio.twiml.MessagingResponse;

export function normalizeE164(value) {
  return String(value || "").trim();
}

export function getBaseUrl(req) {
  if (env.publicBaseUrl) return env.publicBaseUrl.replace(/\/$/, "");
  const host = req.headers.host;
  if (!host) return "";
  const proto = String(req.headers["x-forwarded-proto"] || "https");
  return `${proto}://${host}`;
}

export function validateTwilioSignatureIfEnabled({ req, params }) {
  if (!env.twilio.validateSignatures) return true;
  const base = getBaseUrl(req);
  if (!base) return false;
  const signature = req.headers["x-twilio-signature"] || "";
  const url = `${base}${req.url}`;
  return twilio.validateRequest(env.twilio.authToken, String(signature), url, params);
}

