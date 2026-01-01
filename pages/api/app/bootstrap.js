import { requireBusinessFromTo } from "../../../lib/appApi.js";
import { listTechnicians } from "../../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  try {
    const business = await requireBusinessFromTo(req, res);
    if (!business) return;

    const technicians = await listTechnicians({ businessId: business.id });

    res.status(200).json({
      business,
      technicians,
      leadStatusOptions: ["new", "open", "quoted", "scheduled", "in-progress", "done"]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

