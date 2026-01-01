import { requireBusinessFromTo, readQueryString } from "../../../lib/appApi.js";
import { listLeads } from "../../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const business = await requireBusinessFromTo(req, res);
    if (!business) return;

    const q = readQueryString(req, "q");
    const status = readQueryString(req, "status");
    const limit = Math.min(Math.max(parseInt(readQueryString(req, "limit") || "50", 10) || 50, 1), 100);
    const offset = Math.max(parseInt(readQueryString(req, "offset") || "0", 10) || 0, 0);

    const leads = await listLeads({ businessId: business.id, q, status, limit, offset });
    res.status(200).json({ leads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

