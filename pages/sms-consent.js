import Head from "next/head";
import { useMemo, useState } from "react";

export async function getServerSideProps(ctx) {
  const to = String(ctx.query.to || "").trim();
  const business = to
    ? await import("../lib/supabase.js")
        .then(({ getBusinessByTwilioNumber }) => getBusinessByTwilioNumber(to))
        .catch(() => null)
    : null;

  return {
    props: {
      to,
      businessName: business?.name || "",
      businessTwilioNumber: business?.twilio_number || ""
    }
  };
}

export default function SmsConsentPage({ to, businessName, businessTwilioNumber }) {
  const displayName = businessName || "our business";
  const effectiveTo = businessTwilioNumber || to || "";

  const [phone, setPhone] = useState("");
  const [checked, setChecked] = useState(false);
  const [status, setStatus] = useState({ state: "idle", message: "" });

  const consentText = useMemo(() => {
    if (!displayName) return "";
    return `I agree to receive SMS messages from ${displayName} about my inquiry. Message & data rates may apply. Reply STOP to opt out.`;
  }, [displayName]);

  async function submit(e) {
    e.preventDefault();
    setStatus({ state: "loading", message: "" });
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: effectiveTo, phone, consent: checked })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Request failed");
      setStatus({ state: "success", message: "Opt-in recorded. You can now receive texts from this number." });
    } catch (err) {
      setStatus({ state: "error", message: err?.message || "Something went wrong" });
    }
  }

  return (
    <>
      <Head>
        <title>SMS Opt-In</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <link rel="stylesheet" href="/app.css" />
      </Head>

      <main className="container">
        <header className="header">
          <h1>SMS Opt-In</h1>
          <p className="subtitle">Proof of consent collection for Twilio messaging compliance</p>
        </header>

        <section className="card">
          <h2>Business</h2>
          <div className="row">
            <span className="label">Name</span>
            <span>{displayName}</span>
          </div>
          <div className="row">
            <span className="label">Messaging number</span>
            <code>{effectiveTo || "Add ?to=+15551234567"}</code>
          </div>
        </section>

        <section className="card">
          <h2>Opt-in form</h2>
          <form onSubmit={submit} className="form">
            <label className="field">
              <span className="label">Your mobile number (E.164 recommended)</span>
              <input
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+15551234567"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </label>

            <label className="checkboxRow">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} required />
              <span className="checkboxText">{consentText}</span>
            </label>

            <button className="btn" disabled={status.state === "loading" || !effectiveTo}>
              {status.state === "loading" ? "Submitting…" : "Opt in"}
            </button>

            {status.state !== "idle" ? <p className={status.state === "error" ? "muted error" : "muted"}>{status.message}</p> : null}
            {!effectiveTo ? (
              <p className="muted">
                This page needs a Twilio “To” number to record consent. Example: <code>/sms-consent?to=+15551234567</code>
              </p>
            ) : null}
          </form>
        </section>

        <section className="card">
          <h2>Sample messages (for Twilio verification)</h2>
          <p className="muted">Examples of SMS content a consumer can expect to receive.</p>
          <div className="sample">
            <div className="sampleLabel">1) Missed call follow-up</div>
            <div className="sampleBody">
              <code>
                {displayName}: Sorry we missed your call — reply with the job + address and we’ll reach out ASAP. Reply STOP to opt out.
              </code>
            </div>
          </div>
          <div className="sample">
            <div className="sampleLabel">2) Confirmation after reply</div>
            <div className="sampleBody">
              <code>{displayName}: Got it — thanks! We’ll reach out ASAP. Reply STOP to opt out.</code>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Help / STOP</h2>
          <p className="muted">
            To stop receiving messages, reply <code>STOP</code>. For help, reply <code>HELP</code>.
          </p>
        </section>
      </main>
    </>
  );
}
