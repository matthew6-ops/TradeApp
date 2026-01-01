import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>TradeApp MVP</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="stylesheet" href="/app.css" />
      </Head>

      <main className="container">
        <header className="header">
          <h1>TradeApp MVP</h1>
          <p className="subtitle">Missed calls → recovered leads (Twilio + Supabase)</p>
        </header>

        <section className="card">
          <h2>Status</h2>
          <div className="row">
            <span className="label">Backend</span>
            <span id="health" className="pill">
              checking…
            </span>
          </div>
          <p className="muted">This UI is intentionally minimal. The core product is automated SMS recovery + lead routing.</p>
        </section>

        <section className="card">
          <h2>Mobile app (PWA)</h2>
          <p className="muted">Open the fast, on-the-go lead inbox + schedule UI.</p>
          <div className="row">
            <span className="label">App</span>
            <a className="topLink" href="/app">
              Open /app
            </a>
          </div>
        </section>

        <section className="card">
          <h2>What happens</h2>
          <ol className="list">
            <li>Customer calls a Twilio number.</li>
            <li>We dial the business owner; if missed, we auto-text the customer asking for job + address.</li>
            <li>Customer replies by SMS → we store/update a lead in Supabase and forward it to the owner by SMS.</li>
          </ol>
        </section>

        <section className="card">
          <h2>Endpoints</h2>
          <div className="row">
            <span className="label">Voice webhook</span>
            <code>POST /api/voice</code>
          </div>
          <div className="row">
            <span className="label">SMS webhook</span>
            <code>POST /api/sms</code>
          </div>
          <div className="row">
            <span className="label">SMS opt-in</span>
            <code>/sms-consent?to=+15551234567</code>
          </div>
          <div className="row">
            <span className="label">Health</span>
            <code>GET /api/health</code>
          </div>
        </section>

        <footer className="footer">
          <button id="install" className="btn" disabled>
            Install app
          </button>
          <span className="muted">Add to Home Screen also works on most phones.</span>
        </footer>
      </main>

      <script src="/app.js" />
    </>
  );
}
