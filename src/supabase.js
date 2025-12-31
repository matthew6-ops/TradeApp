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

