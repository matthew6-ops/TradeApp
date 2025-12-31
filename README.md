# TradeApp MVP (missed calls → recovered leads)

Minimal multi-tenant SaaS backend for trade businesses (plumbers/HVAC/electricians) that:

- Receives inbound calls on a Twilio number
- Dials the business owner; if missed, auto-texts the caller to capture the job + address
- When the caller replies by SMS, stores/updates a lead in Supabase, forwards the lead to the owner by SMS, and confirms receipt to the customer

## 1) Setup

1. Create a Supabase project (Postgres).
2. Run the schema in `supabase/schema.sql`.
3. Create a Twilio account and buy at least one phone number (SMS + Voice).
4. Copy `.env.example` to `.env` and fill in values.
5. Install dependencies and run:
   - `npm install`
   - `npm run dev`

## 2) Configure tenants (multi-tenant)

Each business row maps **one Twilio number** → **one owner phone**.

Insert at least one business:

```sql
insert into public.businesses (name, owner_phone, twilio_number)
values ('ACME Plumbing', '+15551234567', '+15557654321');
```

Notes:
- Store phone numbers in E.164 format (e.g. `+15551234567`).
- Routing is done by `To` (the Twilio number) → `businesses.twilio_number`.

## 3) Twilio webhooks

Set your Twilio phone number webhooks to point at this server:

- Voice webhook (A CALL COMES IN): `POST {PUBLIC_BASE_URL}/voice`
- Messaging webhook (A MESSAGE COMES IN): `POST {PUBLIC_BASE_URL}/sms`

If you’re testing locally, expose the server with a tunnel (e.g. ngrok) and set `PUBLIC_BASE_URL` to the public HTTPS URL.

## 4) Webhook behavior (what happens)

### POST `/voice`

- Stage `incoming` (first request from Twilio):
  - Looks up the business by `To`
  - Dials `businesses.owner_phone`
  - Sets `action=/voice?stage=dial_end` to learn the dial outcome

- Stage `dial_end` (Twilio posts back after `<Dial>` ends):
  - If missed (`DialCallStatus` in `no-answer|busy|failed|canceled`):
    - Sends SMS to the caller: “Sorry we missed your call — what do you need help with? Reply with the job + address.”
    - Logs `missed_call` and `auto_text_sent` events

### POST `/sms`

- Looks up the business by `To`
- Finds or creates a lead by `(business_id, customer_phone)`
- Stores `last_message`, sets `status=open`, and logs `inbound_sms`
- Forwards the lead to `businesses.owner_phone` via SMS and logs `owner_notified`
- Replies to the customer with TwiML: “Got it — thanks! We’ll reach out ASAP.”

## 5) Data visibility / auditing

For reliability, all key actions are recorded in `public.events` with JSON payloads:

- `missed_call`
- `inbound_sms`
- `auto_text_sent`
- `owner_notified`

## 6) Signature validation (recommended)

Set:

- `TWILIO_VALIDATE_SIGNATURES=true`
- `PUBLIC_BASE_URL=https://your-real-public-domain`

This enables Twilio request signature validation (rejects spoofed webhook requests).

