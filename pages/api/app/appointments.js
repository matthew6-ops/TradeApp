import { requireBusinessFromTo, readQueryString } from "../../../lib/appApi.js";
import { insertAppointment, insertEvent, listAppointments } from "../../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).send("Method not allowed");

  try {
    const business = await requireBusinessFromTo(req, res);
    if (!business) return;

    if (req.method === "GET") {
      const start = readQueryString(req, "start");
      const end = readQueryString(req, "end");
      const appointments = await listAppointments({
        businessId: business.id,
        startIso: start || null,
        endIso: end || null
      });
      return res.status(200).json({ appointments });
    }

    const created = await insertAppointment({
      businessId: business.id,
      leadId: req.body?.lead_id || null,
      title: req.body?.title || "",
      address: req.body?.address || "",
      startsAtIso: req.body?.starts_at,
      endsAtIso: req.body?.ends_at || null,
      assignedTechId: req.body?.assigned_tech_id || null
    });

    await insertEvent({
      businessId: business.id,
      leadId: created.lead_id,
      type: "appointment_created",
      payload: { appointmentId: created.id, starts_at: created.starts_at }
    });

    return res.status(201).json({ appointment: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

