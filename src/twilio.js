import twilio from "twilio";
import { env } from "./env.js";

export const twilioClient = twilio(env.twilio.accountSid, env.twilio.authToken);
export const VoiceResponse = twilio.twiml.VoiceResponse;
export const MessagingResponse = twilio.twiml.MessagingResponse;

export function buildWebhookUrl(req) {
  // Twilio signature validation needs the exact public URL Twilio used.
  // Set PUBLIC_BASE_URL in production (e.g., https://your-domain.com).
  if (!env.publicBaseUrl) return "";
  const base = env.publicBaseUrl.replace(/\/$/, "");
  return `${base}${req.originalUrl}`;
}

export function validateTwilioSignatureIfEnabled(req) {
  if (!env.twilio.validateSignatures) return true;
  const url = buildWebhookUrl(req);
  if (!url) return false;
  const signature = req.header("x-twilio-signature") || "";
  return twilio.validateRequest(env.twilio.authToken, signature, url, req.body);
}

