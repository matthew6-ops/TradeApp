import { requireBusinessFromTo } from "../../../../lib/appApi.js";
import { getLeadById, insertEvent, updateLead } from "../../../../lib/supabase.js";

function getLeadId(req) {
  const id = req.query?.id;
  if (Array.isArray(id)) return id[0] || "";
  return String(id || "");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") return res.status(405).send("Method not allowed");

  try {
    const business = await requireBusinessFromTo(req, res);
    if (!business) return;

    const leadId = getLeadId(req);
    if (!leadId) return res.status(400).json({ error: "Missing lead id" });

    if (req.method === "GET") {
      const lead = await getLeadById({ businessId: business.id, leadId });
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      return res.status(200).json({ lead });
    }

    const before = await getLeadById({ businessId: business.id, leadId });
    if (!before) return res.status(404).json({ error: "Lead not found" });

    const lead = await updateLead({ businessId: business.id, leadId, patch: req.body || {} });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    await insertEvent({
      businessId: business.id,
      leadId: lead.id,
      type: "lead_updated",
      payload: { before, after: lead }
    });

    return res.status(200).json({ lead });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

