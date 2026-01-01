import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

export const supabase = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
  auth: { persistSession: false }
});

export async function getBusinessByTwilioNumber(twilioNumber) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id,name,owner_phone,twilio_number")
    .eq("twilio_number", twilioNumber)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function upsertLeadForInboundSms({ businessId, customerPhone, lastMessage }) {
  const { data: existing, error: findError } = await supabase
    .from("leads")
    .select("id,status")
    .eq("business_id", businessId)
    .eq("customer_phone", customerPhone)
    .maybeSingle();

  if (findError) throw findError;

  if (existing) {
    const { data: updated, error: updateError } = await supabase
      .from("leads")
      .update({
        last_message: lastMessage,
        status: "open",
        updated_at: new Date().toISOString()
      })
      .eq("id", existing.id)
      .select("id,business_id,customer_phone,status,last_message,created_at,updated_at")
      .single();

    if (updateError) throw updateError;
    return updated;
  }

  const { data: created, error: createError } = await supabase
    .from("leads")
    .insert({
      business_id: businessId,
      customer_phone: customerPhone,
      status: "open",
      last_message: lastMessage
    })
    .select("id,business_id,customer_phone,status,last_message,created_at,updated_at")
    .single();

  if (createError) throw createError;
  return created;
}

export async function insertEvent({ businessId, leadId = null, type, payload }) {
  const { error } = await supabase.from("events").insert({
    business_id: businessId,
    lead_id: leadId,
    type,
    payload
  });
  if (error) throw error;
}

export async function hasSmsConsent({ businessId, customerPhone }) {
  const { data, error } = await supabase
    .from("sms_consents")
    .select("id")
    .eq("business_id", businessId)
    .eq("customer_phone", customerPhone)
    .order("consented_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data || []).length > 0;
}

export async function insertSmsConsent({ businessId, customerPhone, ip = null, userAgent = null }) {
  const { error } = await supabase.from("sms_consents").insert({
    business_id: businessId,
    customer_phone: customerPhone,
    ip,
    user_agent: userAgent
  });
  if (error) throw error;
}

export async function listTechnicians({ businessId }) {
  const { data, error } = await supabase
    .from("technicians")
    .select("id,name,phone,active,created_at")
    .eq("business_id", businessId)
    .order("active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function listLeads({ businessId, q = "", status = "", limit = 50, offset = 0 }) {
  let query = supabase
    .from("leads")
    .select("id,business_id,customer_phone,customer_name,job_address,assigned_tech_id,status,last_message,created_at,updated_at")
    .eq("business_id", businessId);

  const trimmed = String(q || "").trim();
  if (trimmed) {
    const like = `%${trimmed}%`;
    query = query.or(
      [
        `customer_phone.ilike.${like}`,
        `customer_name.ilike.${like}`,
        `job_address.ilike.${like}`,
        `last_message.ilike.${like}`
      ].join(",")
    );
  }

  const statusTrimmed = String(status || "").trim();
  if (statusTrimmed) query = query.eq("status", statusTrimmed);

  const { data, error } = await query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);
  if (error) throw error;
  return data || [];
}

export async function getLeadById({ businessId, leadId }) {
  const { data, error } = await supabase
    .from("leads")
    .select("id,business_id,customer_phone,customer_name,job_address,assigned_tech_id,status,last_message,created_at,updated_at")
    .eq("business_id", businessId)
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateLead({ businessId, leadId, patch }) {
  const allowed = {};
  if (patch && typeof patch === "object") {
    if (typeof patch.customer_name === "string") allowed.customer_name = patch.customer_name.trim() || null;
    if (typeof patch.job_address === "string") allowed.job_address = patch.job_address.trim() || null;
    if (typeof patch.status === "string") allowed.status = patch.status.trim();
    if (typeof patch.assigned_tech_id === "string") allowed.assigned_tech_id = patch.assigned_tech_id.trim() || null;
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("leads")
    .update(allowed)
    .eq("business_id", businessId)
    .eq("id", leadId)
    .select("id,business_id,customer_phone,customer_name,job_address,assigned_tech_id,status,last_message,created_at,updated_at")
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listLeadNotes({ businessId, leadId, limit = 50 }) {
  const { data, error } = await supabase
    .from("lead_notes")
    .select("id,lead_id,business_id,body,created_at")
    .eq("business_id", businessId)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function insertLeadNote({ businessId, leadId, body }) {
  const text = String(body || "").trim();
  if (!text) throw new Error("Missing note body");

  const { data, error } = await supabase
    .from("lead_notes")
    .insert({ business_id: businessId, lead_id: leadId, body: text })
    .select("id,lead_id,business_id,body,created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function listAppointments({ businessId, startIso, endIso, limit = 100 }) {
  let query = supabase
    .from("appointments")
    .select("id,business_id,lead_id,title,address,starts_at,ends_at,status,assigned_tech_id,created_at")
    .eq("business_id", businessId);

  if (startIso) query = query.gte("starts_at", startIso);
  if (endIso) query = query.lte("starts_at", endIso);

  const { data, error } = await query.order("starts_at", { ascending: true }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function insertAppointment({ businessId, leadId = null, title = "", address = "", startsAtIso, endsAtIso = null, assignedTechId = null }) {
  const starts_at = String(startsAtIso || "").trim();
  if (!starts_at) throw new Error("Missing starts_at");

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      business_id: businessId,
      lead_id: leadId,
      title: String(title || "").trim() || null,
      address: String(address || "").trim() || null,
      starts_at,
      ends_at: endsAtIso ? String(endsAtIso).trim() : null,
      assigned_tech_id: assignedTechId ? String(assignedTechId).trim() : null
    })
    .select("id,business_id,lead_id,title,address,starts_at,ends_at,status,assigned_tech_id,created_at")
    .single();

  if (error) throw error;
  return data;
}

export async function getEventCounts({ businessId, sinceIso }) {
  const { data, error } = await supabase
    .from("events")
    .select("type,created_at")
    .eq("business_id", businessId)
    .gte("created_at", sinceIso);

  if (error) throw error;

  const counts = {};
  for (const row of data || []) counts[row.type] = (counts[row.type] || 0) + 1;
  return counts;
}
