import Head from "next/head";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

function formatIsoLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function safePct(value) {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function useTenantTo() {
  const router = useRouter();
  const to = typeof router.query.to === "string" ? router.query.to : "";

  useEffect(() => {
    if (!router.isReady) return;
    if (to) {
      try {
        localStorage.setItem("tradeapp_to", to);
      } catch {}
      return;
    }
    try {
      const saved = localStorage.getItem("tradeapp_to") || "";
      if (saved) router.replace({ pathname: "/app", query: { to: saved } }, undefined, { shallow: true });
    } catch {}
  }, [router, to]);

  return { to, setTo: (nextTo) => router.push({ pathname: "/app", query: { to: nextTo } }) };
}

function Modal({ open, title, onClose, children }) {
  const closeBtnRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    closeBtnRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="modalOverlay" role="dialog" aria-modal="true" aria-label={title || "Dialog"}>
      <div className="modalCard">
        <div className="modalHeader">
          <div className="modalTitle">{title}</div>
          <button ref={closeBtnRef} className="iconBtn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modalBody">{children}</div>
      </div>
    </div>
  );
}

export default function AppHome() {
  const router = useRouter();
  const { to, setTo } = useTenantTo();
  const [tab, setTab] = useState("leads");

  const [boot, setBoot] = useState({ state: "idle", business: null, technicians: [], leadStatusOptions: [] });
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError("");
      if (!to) return;
      setBoot((s) => ({ ...s, state: "loading" }));
      try {
        const res = await fetch(`/api/app/bootstrap?to=${encodeURIComponent(to)}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setBoot({ state: "ready", ...data });
      } catch (e) {
        if (!cancelled) {
          setBoot({ state: "error", business: null, technicians: [], leadStatusOptions: [] });
          setError(e?.message || "Failed to load");
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [to]);

  useEffect(() => {
    if (!router.isReady) return;
    const nextTab = typeof router.query.tab === "string" ? router.query.tab : "";
    if (nextTab) setTab(nextTab);
  }, [router.isReady, router.query.tab]);

  const businessName = boot.business?.name || "TradeApp";

  return (
    <>
      <Head>
        <title>{businessName}</title>
        <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="stylesheet" href="/app.css" />
      </Head>

      <main className="appShell">
        <header className="appTopbar">
          <div className="appBrand">
            <div className="appTitle">{boot.state === "ready" ? boot.business?.name : "TradeApp"}</div>
            <div className="appSub">{to ? `Tenant: ${to}` : "Connect a Twilio number"}</div>
          </div>
          <a className="topLink" href="/">
            Home
          </a>
        </header>

        <section className="appContent">
          {!to ? <ConnectCard onConnect={setTo} /> : null}
          {error ? <div className="card"><h2>Couldn’t load</h2><p className="muted">{error}</p></div> : null}

          {to && boot.state === "ready" ? (
            <>
              {tab === "leads" ? <LeadsView to={to} boot={boot} /> : null}
              {tab === "schedule" ? <ScheduleView to={to} boot={boot} /> : null}
              {tab === "analytics" ? <AnalyticsView to={to} /> : null}
              {tab === "more" ? <MoreView to={to} boot={boot} /> : null}
            </>
          ) : null}
        </section>

        <nav className="tabBar" aria-label="Main">
          <button className={tab === "leads" ? "tab active" : "tab"} onClick={() => setTab("leads")}>
            Leads
          </button>
          <button className={tab === "schedule" ? "tab active" : "tab"} onClick={() => setTab("schedule")}>
            Schedule
          </button>
          <button className={tab === "analytics" ? "tab active" : "tab"} onClick={() => setTab("analytics")}>
            Analytics
          </button>
          <button className={tab === "more" ? "tab active" : "tab"} onClick={() => setTab("more")}>
            More
          </button>
        </nav>
      </main>
      <script src="/app.js" />
    </>
  );
}

function ConnectCard({ onConnect }) {
  const [value, setValue] = useState("");
  return (
    <section className="card">
      <h2>Connect your number</h2>
      <p className="muted">Enter the Twilio number for this business (E.164). This keeps the app multi-tenant without logins for now.</p>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = value.trim();
          if (trimmed) onConnect(trimmed);
        }}
      >
        <label className="field">
          <span className="label">Twilio “To” number</span>
          <input className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="+15551234567" required />
        </label>
        <button className="btn">Open app</button>
      </form>
      <p className="muted">
        Tip: open <code>/sms-consent?to=YOUR_NUMBER</code> to collect SMS opt-in.
      </p>
    </section>
  );
}

function LeadsView({ to, boot }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const dq = useDebounced(q, 250);

  const [state, setState] = useState({ loading: true, leads: [] });
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setState((s) => ({ ...s, loading: true }));
      try {
        const params = new URLSearchParams({ to });
        if (dq) params.set("q", dq);
        if (status) params.set("status", status);
        const res = await fetch(`/api/app/leads?${params.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setState({ loading: false, leads: data.leads || [] });
      } catch (_e) {
        if (!cancelled) setState({ loading: false, leads: [] });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [to, dq, status]);

  const techById = useMemo(() => {
    const map = new Map();
    for (const t of boot.technicians || []) map.set(t.id, t);
    return map;
  }, [boot.technicians]);

  return (
    <>
      <section className="card">
        <h2>Leads</h2>
        <div className="toolbar">
          <input className="input inputSmall" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search phone, name, address…" />
        </div>
        <div className="chipRow" aria-label="Status filter">
          <button className={!status ? "chip active" : "chip"} onClick={() => setStatus("")}>
            All
          </button>
          {(boot.leadStatusOptions || []).map((s) => (
            <button key={s} className={status === s ? "chip active" : "chip"} onClick={() => setStatus(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="muted">{state.loading ? "Loading…" : `${state.leads.length} lead(s)`}</div>
      </section>

      <section className="card">
        <h2>List</h2>
        <div className="listCards">
          {state.leads.map((lead) => {
            const assigned = lead.assigned_tech_id ? techById.get(lead.assigned_tech_id) : null;
            return (
              <button key={lead.id} className="listCard" onClick={() => setSelectedId(lead.id)}>
                <div className="listCardTop">
                  <div className="listCardTitle">{lead.customer_name || lead.customer_phone}</div>
                  <span className="statusPill">{lead.status || "open"}</span>
                </div>
                <div className="listCardSub">
                  {lead.job_address ? <span className="muted">{lead.job_address}</span> : <span className="muted">{lead.customer_phone}</span>}
                </div>
                <div className="listCardMsg">{lead.last_message || "—"}</div>
                <div className="listCardMeta">
                  <span className="muted">{formatIsoLocal(lead.updated_at)}</span>
                  <span className="muted">{assigned ? `Assigned: ${assigned.name}` : "Unassigned"}</span>
                </div>
              </button>
            );
          })}
          {!state.loading && state.leads.length === 0 ? <div className="muted">No leads yet. Miss a call and the SMS reply will create one.</div> : null}
        </div>
      </section>

      <LeadDetailModal open={!!selectedId} onClose={() => setSelectedId("")} to={to} leadId={selectedId} boot={boot} />
    </>
  );
}

function LeadDetailModal({ open, onClose, to, leadId, boot }) {
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteBody, setNoteBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState({ starts_at: "", title: "", address: "" });

  async function refresh() {
    if (!leadId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/app/leads/${encodeURIComponent(leadId)}?to=${encodeURIComponent(to)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLead(data.lead);

      const notesRes = await fetch(`/api/app/leads/${encodeURIComponent(leadId)}/notes?to=${encodeURIComponent(to)}`, { cache: "no-store" });
      const notesData = await notesRes.json().catch(() => ({}));
      if (notesRes.ok) setNotes(notesData.notes || []);
    } catch {
      setLead(null);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  useEffect(() => {
    if (!lead) return;
    setSchedule((s) => ({
      ...s,
      title: s.title || (lead.last_message ? "Service call" : ""),
      address: s.address || lead.job_address || ""
    }));
  }, [lead]);

  async function patchLead(patch) {
    setSaving(true);
    try {
      const res = await fetch(`/api/app/leads/${encodeURIComponent(leadId)}?to=${encodeURIComponent(to)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setLead(data.lead);
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    const body = noteBody.trim();
    if (!body) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/app/leads/${encodeURIComponent(leadId)}/notes?to=${encodeURIComponent(to)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotes((n) => [data.note, ...n]);
      setNoteBody("");
    } finally {
      setSaving(false);
    }
  }

  async function createAppointment() {
    if (!schedule.starts_at) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/app/appointments?to=${encodeURIComponent(to)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          title: schedule.title || "Service call",
          address: schedule.address || "",
          starts_at: new Date(schedule.starts_at).toISOString(),
          assigned_tech_id: lead?.assigned_tech_id || null
        })
      });
      await res.json().catch(() => ({}));
      if (res.ok) await patchLead({ status: "scheduled" });
    } finally {
      setSaving(false);
    }
  }

  const title = lead?.customer_name || lead?.customer_phone || "Lead";
  const techOptions = boot.technicians || [];

  return (
    <Modal open={open} title={title} onClose={onClose}>
      {loading ? <p className="muted">Loading…</p> : null}
      {!loading && !lead ? <p className="muted">Couldn’t load lead.</p> : null}
      {!lead ? null : (
        <div className="detail">
          <div className="detailActions">
            <a className="btn small" href={`tel:${lead.customer_phone}`}>
              Call
            </a>
            <a className="btn small" href={`sms:${lead.customer_phone}`}>
              Text
            </a>
            <button className="btn small" onClick={refresh} disabled={saving}>
              Refresh
            </button>
          </div>

          <div className="detailGrid">
            <label className="field">
              <span className="label">Name</span>
              <input
                className="input"
                value={lead.customer_name || ""}
                onChange={(e) => setLead((l) => ({ ...l, customer_name: e.target.value }))}
                onBlur={() => patchLead({ customer_name: lead.customer_name || "" })}
                placeholder="(optional)"
              />
            </label>
            <label className="field">
              <span className="label">Address</span>
              <input
                className="input"
                value={lead.job_address || ""}
                onChange={(e) => setLead((l) => ({ ...l, job_address: e.target.value }))}
                onBlur={() => patchLead({ job_address: lead.job_address || "" })}
                placeholder="(optional)"
              />
            </label>
            <label className="field">
              <span className="label">Status</span>
              <div className="chipRow">
                {(boot.leadStatusOptions || []).map((s) => (
                  <button key={s} className={lead.status === s ? "chip active" : "chip"} onClick={() => patchLead({ status: s })} disabled={saving}>
                    {s}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              <span className="label">Assigned tech</span>
              <select
                className="input"
                value={lead.assigned_tech_id || ""}
                onChange={(e) => patchLead({ assigned_tech_id: e.target.value || null })}
                disabled={saving}
              >
                <option value="">Unassigned</option>
                {techOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <section className="miniCard">
            <div className="miniTitle">Last message</div>
            <div className="miniBody">{lead.last_message || "—"}</div>
          </section>

          <section className="miniCard">
            <div className="miniTitle">Quick schedule</div>
            <div className="detailGrid">
              <label className="field">
                <span className="label">Start</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={schedule.starts_at}
                  onChange={(e) => setSchedule((s) => ({ ...s, starts_at: e.target.value }))}
                />
              </label>
              <label className="field">
                <span className="label">Title</span>
                <input className="input" value={schedule.title} onChange={(e) => setSchedule((s) => ({ ...s, title: e.target.value }))} />
              </label>
              <label className="field">
                <span className="label">Address</span>
                <input className="input" value={schedule.address} onChange={(e) => setSchedule((s) => ({ ...s, address: e.target.value }))} />
              </label>
            </div>
            <button className="btn" onClick={createAppointment} disabled={saving || !schedule.starts_at}>
              Create appointment
            </button>
          </section>

          <section className="miniCard">
            <div className="miniTitle">Notes</div>
            <div className="noteComposer">
              <input className="input" value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add a note…" />
              <button className="btn small" onClick={addNote} disabled={saving || !noteBody.trim()}>
                Add
              </button>
            </div>
            <div className="noteList">
              {notes.map((n) => (
                <div key={n.id} className="noteItem">
                  <div className="noteBody">{n.body}</div>
                  <div className="muted">{formatIsoLocal(n.created_at)}</div>
                </div>
              ))}
              {notes.length === 0 ? <div className="muted">No notes yet.</div> : null}
            </div>
          </section>
        </div>
      )}
    </Modal>
  );
}

function ScheduleView({ to, boot }) {
  const [state, setState] = useState({ loading: true, appointments: [] });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setState((s) => ({ ...s, loading: true }));
      const start = new Date();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({ to, start: start.toISOString(), end: end.toISOString() });
      try {
        const res = await fetch(`/api/app/appointments?${params.toString()}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setState({ loading: false, appointments: data.appointments || [] });
      } catch (_e) {
        if (!cancelled) setState({ loading: false, appointments: [] });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [to]);

  const techById = useMemo(() => {
    const map = new Map();
    for (const t of boot.technicians || []) map.set(t.id, t);
    return map;
  }, [boot.technicians]);

  return (
    <section className="card">
      <h2>Schedule (next 7 days)</h2>
      <div className="muted">{state.loading ? "Loading…" : `${state.appointments.length} appointment(s)`}</div>
      <div className="listCards">
        {state.appointments.map((a) => {
          const tech = a.assigned_tech_id ? techById.get(a.assigned_tech_id) : null;
          return (
            <div key={a.id} className="listCard passive">
              <div className="listCardTop">
                <div className="listCardTitle">{a.title || "Service call"}</div>
                <span className="statusPill">{a.status}</span>
              </div>
              <div className="listCardSub">
                <span className="muted">{formatIsoLocal(a.starts_at)}</span>
                {a.address ? <span className="muted">{a.address}</span> : null}
              </div>
              <div className="listCardMeta">
                <span className="muted">{tech ? `Tech: ${tech.name}` : "Tech: —"}</span>
                {a.lead_id ? <span className="muted">Lead linked</span> : <span className="muted">No lead</span>}
              </div>
            </div>
          );
        })}
        {!state.loading && state.appointments.length === 0 ? <div className="muted">No appointments yet. Create one from a lead.</div> : null}
      </div>
    </section>
  );
}

function AnalyticsView({ to }) {
  const [days, setDays] = useState(30);
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setState({ loading: true, data: null });
      try {
        const res = await fetch(`/api/app/analytics?to=${encodeURIComponent(to)}&days=${days}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (!cancelled) setState({ loading: false, data });
      } catch (_e) {
        if (!cancelled) setState({ loading: false, data: null });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [to, days]);

  const data = state.data;

  return (
    <section className="card">
      <h2>Analytics</h2>
      <div className="toolbar">
        <label className="field inline">
          <span className="label">Window</span>
          <select className="input inputSmall" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </label>
      </div>
      {state.loading ? <div className="muted">Loading…</div> : null}
      {!state.loading && !data ? <div className="muted">No data yet.</div> : null}
      {!data ? null : (
        <div className="kpiGrid">
          <div className="kpi">
            <div className="kpiLabel">Missed calls</div>
            <div className="kpiValue">{data.kpis?.missedCalls ?? 0}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Auto-texts sent</div>
            <div className="kpiValue">{data.kpis?.autoTexts ?? 0}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Inbound SMS</div>
            <div className="kpiValue">{data.kpis?.inboundSms ?? 0}</div>
          </div>
          <div className="kpi">
            <div className="kpiLabel">Recovery rate</div>
            <div className="kpiValue">{safePct(data.kpis?.recoveryRate)}</div>
          </div>
        </div>
      )}
    </section>
  );
}

function MoreView({ to, boot }) {
  return (
    <>
      <section className="card">
        <h2>Business</h2>
        <div className="row">
          <span className="label">Name</span>
          <span>{boot.business?.name || "—"}</span>
        </div>
        <div className="row">
          <span className="label">Twilio number</span>
          <code>{to}</code>
        </div>
        <div className="row">
          <span className="label">Owner phone</span>
          <code>{boot.business?.owner_phone || "—"}</code>
        </div>
        <div className="row">
          <span className="label">SMS consent page</span>
          <a className="topLink" href={`/sms-consent?to=${encodeURIComponent(to)}`}>
            Open
          </a>
        </div>
      </section>

      <section className="card">
        <h2>Techs (outline)</h2>
        <p className="muted">Technician management UI is next; this lists what’s in the database.</p>
        <div className="listCards">
          {(boot.technicians || []).map((t) => (
            <div key={t.id} className="listCard passive">
              <div className="listCardTop">
                <div className="listCardTitle">{t.name}</div>
                <span className="statusPill">{t.active ? "active" : "inactive"}</span>
              </div>
              <div className="listCardMeta">
                <span className="muted">{t.phone || "—"}</span>
              </div>
            </div>
          ))}
          {(boot.technicians || []).length === 0 ? <div className="muted">No technicians yet.</div> : null}
        </div>
      </section>

      <section className="card">
        <h2>Coming soon (outline)</h2>
        <ul className="list">
          <li>Estimates & invoicing</li>
          <li>Customer portal + reviews</li>
          <li>“On my way” texts + GPS check-in</li>
          <li>QuickBooks + Google Calendar</li>
        </ul>
      </section>
    </>
  );
}

