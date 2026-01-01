import { requireBusinessFromTo, readQueryString } from "../../../lib/appApi.js";
import { getEventCounts } from "../../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const business = await requireBusinessFromTo(req, res);
    if (!business) return;

    const days = Math.min(Math.max(parseInt(readQueryString(req, "days") || "30", 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const counts = await getEventCounts({ businessId: business.id, sinceIso: since });

    const missedCalls = counts.missed_call || 0;
    const inboundSms = counts.inbound_sms || 0;
    const autoTexts = counts.auto_text_sent || 0;
    const consentSkips = counts.auto_text_skipped_no_consent || 0;

    res.status(200).json({
      since,
      days,
      counts,
      kpis: {
        missedCalls,
        autoTexts,
        inboundSms,
        consentSkips,
        recoveryRate: missedCalls > 0 ? inboundSms / missedCalls : null
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

