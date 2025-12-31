-- Minimal schema for multi-tenant "missed call → recovered lead" MVP.
-- Assumes the `pgcrypto` extension is available for gen_random_uuid().

create extension if not exists pgcrypto;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_phone text not null,
  twilio_number text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_phone text not null,
  status text not null default 'open',
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_phone)
);

create index if not exists leads_business_id_idx on public.leads (business_id);
create index if not exists leads_customer_phone_idx on public.leads (customer_phone);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_business_id_idx on public.events (business_id);
create index if not exists events_lead_id_idx on public.events (lead_id);
create index if not exists events_type_idx on public.events (type);

-- SMS opt-in records (for toll-free verification + compliance).
create table if not exists public.sms_consents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_phone text not null,
  consented_at timestamptz not null default now(),
  ip text,
  user_agent text
);

create index if not exists sms_consents_business_id_idx on public.sms_consents (business_id);
create index if not exists sms_consents_customer_phone_idx on public.sms_consents (customer_phone);
create index if not exists sms_consents_consented_at_idx on public.sms_consents (consented_at);
