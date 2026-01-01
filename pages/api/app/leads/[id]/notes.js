import { requireBusinessFromTo } from "../../../../../lib/appApi.js";
import { getLeadById, insertEvent, insertLeadNote, listLeadNotes } from "../../../../../lib/supabase.js";

function getLeadId(req) {
  const id = req.query?.id;
  if (Array.isArray(id)) return id[0] || "";
  return String(id || "");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const business = await requireBusinessFromTo(req, res);
    if (!business) return;

    const leadId = getLeadId(req);
    if (!leadId) return res.status(400).json({ error: "Missing lead id" });

    const lead = await getLeadById({ businessId: business.id, leadId });
    if (!lead) return res.status(404).json({ error: "Lead not found" });

    if (req.method === "GET") {
      const notes = await listLeadNotes({ businessId: business.id, leadId });
      return res.status(200).json({ notes });
    }

    const note = await insertLeadNote({ businessId: business.id, leadId, body: req.body?.body });
    await insertEvent({
      businessId: business.id,
      leadId,
      type: "lead_note_added",
      payload: { noteId: note.id }
    });
    return res.status(201).json({ note });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

