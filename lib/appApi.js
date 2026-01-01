import { getBusinessByTwilioNumber } from "./supabase.js";
import { normalizeE164 } from "./twilio.js";

export function json(res, status, body) {
  res.status(status).json(body);
}

export function readQueryString(req, key) {
  const value = req.query?.[key];
  if (Array.isArray(value)) return value[0] || "";
  return String(value || "");
}

export async function requireBusinessFromTo(req, res) {
  const toRaw = readQueryString(req, "to");
  const to = normalizeE164(toRaw);
  if (!to) {
    json(res, 400, { error: "Missing to" });
    return null;
  }

  const business = await getBusinessByTwilioNumber(to);
  if (!business) {
    json(res, 404, { error: "Unknown Twilio number (no tenant configured)" });
    return null;
  }
  return business;
}

