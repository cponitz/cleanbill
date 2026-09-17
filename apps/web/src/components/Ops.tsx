"use client";
// The operator console (/ops, SPEC-09 D2). One page, five anchored sections — Funnel · Claims · Inquiries · New claim ·
// Health — built on the design system's component sheet (kpi, table, badge, toolbar, drawer). Phone-usable: the
// walkthrough is watched from a phone. The ops password lives in sessionStorage for the tab; three consecutive 403s
// clear it and show the login again. Nothing here sends e-mail (Task 4): an approved draft is copied with one button.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BRAND } from "@/lib/copy";
import { moneyFloor, shortDate } from "@/lib/format";
import { ago, can, CLAIM_STATUSES, clearKey, FUNNEL_KINDS, isErr, MAX_403, type NewClaimMatch, type OpsClaim, type OpsData, type OpsError, opsGet, opsPost, readKey, storeKey } from "@/lib/ops";

// The stored password as an external store (sessionStorage), so the page never sets state inside an effect.
const keyListeners = new Set<() => void>();
let keySnapshot: string | null | undefined;
function subscribeKey(cb: () => void) { keyListeners.add(cb); return () => { keyListeners.delete(cb); }; }
function getKey(): string | null { if (keySnapshot === undefined) keySnapshot = readKey(); return keySnapshot; }
function setStoredKey(k: string | null) { if (k) storeKey(k); else clearKey(); keySnapshot = k; keyListeners.forEach((l) => l()); }
import { PILL } from "@/lib/status";
import { Logo, StatusBadge, StatusPill } from "./ui";

const SECTIONS: Array<[string, string]> = [["funnel", "Funnel"], ["claims", "Claims"], ["inquiries", "Inquiries"], ["new-claim", "New claim"], ["health", "Health"]];
const KPI_TILES: Array<[keyof OpsData["kpis"], string, string?]> = [
  ["leads_loaded", "Leads loaded"], ["mailed", "Mailed"], ["page_views", "Page views"], ["opened", "Opened"], ["claimed", "Claimed"],
  ["ready_to_submit", "Ready to submit", "kpi-accent"], ["needs_dl_update", "Needs DL update", "kpi-warn"], ["needs_review", "Needs review", "kpi-warn"],
  ["filed", "Filed"], ["approved", "Approved"], ["refunded", "Refunded"], ["inquiries_open", "Open inquiries", "kpi-warn"],
];
const SCENARIOS = ["match", "mismatch", "mismatch_then_fix"];

function errText(e: OpsError): string {
  return e.http === 429 ? "Too many failed passwords from this connection. Try again in an hour." : e.http === 403 ? "Wrong password." : `${e.error}${e.hint ? ` — ${e.hint}` : ""}`;
}

export function Ops() {
  const key = useSyncExternalStore(subscribeKey, getKey, () => null);
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fails = useRef(0);

  /** Applies a GET /ops result: data or the error notice; three consecutive 403s clear the stored key. */
  const apply = useCallback((r: OpsData | OpsError): boolean => {
    if (isErr(r)) {
      if (r.http === 403) { fails.current += 1; if (fails.current >= MAX_403) { fails.current = 0; setData(null); setStoredKey(null); } }
      setNotice({ kind: "bad", text: errText(r) });
      return false;
    }
    fails.current = 0;
    setData(r); setNotice(null);
    return true;
  }, []);
  const load = useCallback(async (k: string, filter: string) => apply(await opsGet(k, { status: filter || undefined })), [apply]);

  // First load and reload on a filter change: the state updates happen in the promise callback, not in the effect body.
  useEffect(() => {
    if (!key) return;
    let alive = true;
    opsGet(key, { status: statusFilter || undefined }).then((r) => { if (alive) apply(r); });
    return () => { alive = false; };
  }, [key, statusFilter, apply]);

  async function refresh() { if (!key) return; setLoading(true); await load(key, statusFilter); setLoading(false); }

  async function signIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const k = String(new FormData(e.currentTarget).get("key") ?? "").trim();
    if (!k) return;
    setLoading(true);
    const ok = await load(k, statusFilter);
    setLoading(false);
    setStoredKey(ok ? k : null);
  }
  function signOut() { setStoredKey(null); setData(null); setSelected(null); }

  /** Runs an action, shows its outcome, reloads. */
  async function act(label: string, body: Record<string, unknown>, after?: (r: Record<string, unknown>) => void): Promise<boolean> {
    if (!key) return false;
    setBusy(label);
    const r = await opsPost<Record<string, unknown>>(key, body);
    setBusy(null);
    if (isErr(r)) { setNotice({ kind: "bad", text: `${label}: ${errText(r)}` }); return false; }
    setNotice({ kind: "ok", text: `${label}: done` });
    after?.(r);
    await load(key, statusFilter);
    return true;
  }

  if (!key || !data) {
    return (
      <div className="wrap" style={{ paddingTop: 40, maxWidth: 480 }}>
        <div className="mb-6"><Logo /></div>
        <form className="card" onSubmit={signIn} data-testid="ops-login">
          <h1 className="h3">Ops</h1>
          <p className="fine">The operator console. Enter the ops password; it stays in this tab only.</p>
          <label className="label" htmlFor="ops-key">Ops password</label>
          <input id="ops-key" name="key" type="password" className="input" autoComplete="current-password" data-testid="ops-key" required />
          {notice && <div className="banner-error" role="alert" data-testid="ops-login-error">{notice.text}</div>}
          <button type="submit" className="btn btn-block" aria-busy={loading}>Open</button>
        </form>
      </div>
    );
  }

  const claims = data.claims.filter((c) => {
    if (!search) return true;
    const s = search.toUpperCase();
    return [c.claim_code, c.full_name, c.email, c.situs_full, c.owner_name].some((v) => (v ?? "").toUpperCase().includes(s));
  });
  const current = selected ? data.claims.find((c) => c.id === selected) ?? null : null;

  return (
    <div className="wrap" style={{ paddingTop: 16, paddingBottom: 80 }}>
      <header className="toolbar" style={{ padding: "8px 0 16px" }}>
        <Logo href="/ops" /><span className="pill pill-sm pill-neutral">ops</span>
        <nav className="ds-toc" aria-label="Sections" style={{ marginLeft: 8 }}>{SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>
        <span className="toolbar-spacer" />
        <span className="fine">{shortDate(data.generated_at)} · {ago(data.generated_at)}</span>
        <button type="button" className="btn btn-sm btn-neutral" onClick={refresh} aria-busy={loading} data-testid="btn-refresh">Refresh</button>
        <button type="button" className="btn btn-sm btn-neutral" onClick={signOut}>Sign out</button>
      </header>
      {notice && <div className={notice.kind === "ok" ? "banner-ok" : "banner-error"} role="status" data-testid="ops-notice">{notice.text}</div>}

      {/* ---- 1. Funnel ---------------------------------------------------------------------------------------------- */}
      <Section id="funnel" title="Funnel" sub="Lead and claim counts, then the last 7 days of page events by kind and the step conversion.">
        <div className="kpis" data-testid="ops-kpis">
          {KPI_TILES.map(([k, label, cls]) => (
            <div key={k} className={`kpi ${cls ?? ""}`} data-testid={`kpi-${k}`}><span className="kpi-label">{label}</span><span className="kpi-value">{data.kpis[k].toLocaleString("en-US")}</span></div>
          ))}
        </div>
        <div className="kpis mt-3">
          {data.funnel.steps.map((s) => <div key={s.step} className="kpi"><span className="kpi-label">{s.step}</span><span className="kpi-value">{s.count.toLocaleString("en-US")}</span>{s.pct !== null && <span className="kpi-sub">{s.pct}% of the previous step</span>}</div>)}
        </div>
        <div className="table-wrap mt-3"><table className="table table-dense"><thead><tr><th>Event kind</th><th className="num">7 days</th><th className="num">All time</th></tr></thead><tbody>
          {FUNNEL_KINDS.map((k) => <tr key={k}><td className="mono">{k}</td><td className="num">{data.funnel.by_kind_7d[k] ?? 0}</td><td className="num">{data.funnel.by_kind_all[k] ?? 0}</td></tr>)}
        </tbody></table></div>
        <ByDay rows={data.funnel.by_day_30d} />
      </Section>

      {/* ---- 2. Claims ---------------------------------------------------------------------------------------------- */}
      <Section id="claims" title="Claims" sub="Every claim, newest first. Tap a row for the packet, findings, drafts and actions.">
        <div className="toolbar">
          <select className="input input-sm" aria-label="Status filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="claims-filter">
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((s) => <option key={s} value={s}>{PILL[s]?.label ?? s} ({s})</option>)}
          </select>
          <input className="input input-sm" placeholder="Code, name, address" aria-label="Search claims" value={search} onChange={(e) => setSearch(e.target.value)} />
          <span className="fine">{claims.length} shown</span>
        </div>
        <div className="table-wrap" data-testid="claims-table">
          {claims.length === 0 ? <div className="table-empty">No claims match.</div> : (
            <table className="table">
              <thead><tr><th>Code</th><th>Who / where</th><th>Status</th><th>Findings</th><th className="num">Estimate</th><th>Created</th></tr></thead>
              <tbody>
                {claims.map((c) => {
                  const blocking = c.findings.filter((f) => f.severity === "blocking").length, warn = c.findings.filter((f) => f.severity === "warning").length;
                  return (
                    <tr key={c.id} aria-selected={selected === c.id} onClick={() => setSelected(c.id)} style={{ cursor: "pointer" }} data-testid="claim-row" data-code={c.claim_code ?? ""}>
                      <td className="mono">{c.claim_code}</td>
                      <td><b>{c.full_name ?? "—"}</b><br /><span className="fine">{c.situs_full}</span></td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>{blocking ? <span className="badge badge-bad">{blocking} blocking</span> : null} {warn ? <span className="badge badge-sand">{warn} warning</span> : null} {!blocking && !warn ? <span className="fine">none</span> : null}{c.messages.some((m) => m.agent_draft) && <span className="badge badge-teal" style={{ marginLeft: 4 }}>draft</span>}</td>
                      <td className="num">{moneyFloor(c.est_refund_total)}</td>
                      <td className="fine">{shortDate(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Section>

      {/* ---- 3. Inquiries ------------------------------------------------------------------------------------------- */}
      <Section id="inquiries" title="Inquiries" sub="Every form the public site posted (address checks, exemption / appeal checks, business reviews). Unhandled first. We answer by e-mail.">
        <div className="table-wrap" data-testid="inquiries-table">
          {data.inquiries.length === 0 ? <div className="table-empty">No inquiries yet.</div> : (
            <table className="table table-dense">
              <thead><tr><th>When</th><th>Kind</th><th>Address / company</th><th>E-mail</th><th>From</th><th>Handled</th></tr></thead>
              <tbody>{data.inquiries.map((i) => <InquiryRow key={i.id} i={i} busy={busy} onHandled={(notes) => act("Inquiry handled", { action: "inquiry_handled", inquiry_id: i.id, notes })} />)}</tbody>
            </table>
          )}
        </div>
      </Section>

      {/* ---- 4. New claim ------------------------------------------------------------------------------------------- */}
      <Section id="new-claim" title="New claim" sub="A walkthrough claim for any published property: search by address or TCAD account, check the estimate and the exemption flag, then confirm to get the code and link.">
        <NewClaim keyValue={key} onCreated={refresh} />
      </Section>

      {/* ---- 5. Health ---------------------------------------------------------------------------------------------- */}
      <Section id="health" title="Health" sub="The last deploy, agent run and ETL as the workflows reported them, and the end-to-end selftest on demand.">
        <div className="kpis" data-testid="health">
          {["deploy", "agent_run", "etl"].map((k) => {
            const row = data.system.find((s) => s.key === k);
            const v = row?.value ?? {};
            const result = String(v.result ?? "");
            return (
              <div key={k} className={`kpi ${!row ? "kpi-empty" : result === "success" ? "" : "kpi-warn"}`} data-testid={`health-${k}`}>
                <span className="kpi-label">{k.replace("_", " ")}</span>
                <span className="kpi-value" style={{ fontSize: 20 }}>{row ? result || "recorded" : "—"}</span>
                <span className="kpi-sub">{row ? `${ago(row.updated_at)}${v.commit ? ` · ${String(v.commit).slice(0, 7)}` : ""}${v.claims_processed !== undefined && v.claims_processed !== null ? ` · ${v.claims_processed} claims` : ""}${v.leads ? ` · ${v.leads} leads` : ""}` : "not reported yet"}</span>
                {row && <details className="fine"><summary>details</summary><pre className="mono" style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>{JSON.stringify(v, null, 1)}</pre></details>}
              </div>
            );
          })}
        </div>
        <Selftest keyValue={key} />
      </Section>

      {/* ---- claim drawer ------------------------------------------------------------------------------------------ */}
      <div className="drawer" data-open={!!current} aria-hidden={!current} data-testid="claim-drawer">
        <div className="drawer-bg" onClick={() => setSelected(null)} />
        {current && <ClaimDetail c={current} busy={busy} onClose={() => setSelected(null)} act={act} />}
      </div>
    </div>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="hairline-top" style={{ paddingTop: 20, marginTop: 20 }}>
      <h2 className="h3">{title}</h2>
      {sub && <p className="fine mt-1" style={{ maxWidth: 760 }}>{sub}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function ByDay({ rows }: { rows: Array<{ day: string; kind: string; n: number }> }) {
  const days = [...new Set(rows.map((r) => r.day))].sort().slice(-7);
  if (!days.length) return null;
  const kinds = FUNNEL_KINDS.filter((k) => rows.some((r) => r.kind === k));
  return (
    <div className="table-wrap"><table className="table table-dense"><thead><tr><th>Last 7 days</th>{days.map((d) => <th key={d} className="num">{shortDate(d)}</th>)}</tr></thead><tbody>
      {kinds.map((k) => <tr key={k}><td className="mono">{k}</td>{days.map((d) => <td key={d} className="num">{rows.find((r) => r.day === d && r.kind === k)?.n ?? ""}</td>)}</tr>)}
    </tbody></table></div>
  );
}

function InquiryRow({ i, busy, onHandled }: { i: OpsData["inquiries"][number]; busy: string | null; onHandled: (notes: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  return (
    <tr data-testid="inquiry-row" data-handled={!!i.handled_at}>
      <td className="fine">{shortDate(i.created_at)}</td>
      <td><span className="badge badge-neutral">{i.kind}</span></td>
      <td>{i.company ? <b>{i.company}</b> : i.address}{i.properties ? <span className="fine"> · {i.properties} properties</span> : null}{i.bills?.length ? <span className="fine"> · {i.bills.join(", ")}</span> : null}</td>
      <td className="mono" style={{ fontSize: 12 }}>{i.email}</td>
      <td className="fine">{i.source_path}</td>
      <td>
        {i.handled_at ? <span className="badge badge-ok" title={i.notes ?? ""}>handled {shortDate(i.handled_at)}</span> : open ? (
          <div className="flex flex-col gap-2" style={{ minWidth: 220 }}>
            <input className="input input-sm" placeholder="Note (what you answered)" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Note" data-testid="inquiry-notes" />
            <div className="ds-row"><button type="button" className="btn btn-sm" aria-busy={busy === "Inquiry handled"} onClick={() => onHandled(notes).then((ok) => ok && setOpen(false))} data-testid="btn-inquiry-confirm">Mark handled</button><button type="button" className="btn btn-sm btn-neutral" onClick={() => setOpen(false)}>Cancel</button></div>
          </div>
        ) : <button type="button" className="btn btn-sm btn-outline" onClick={() => setOpen(true)} data-testid="btn-inquiry-handled">Mark handled</button>}
      </td>
    </tr>
  );
}

function NewClaim({ keyValue, onCreated }: { keyValue: string; onCreated: () => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<NewClaimMatch[] | null>(null);
  const [created, setCreated] = useState<{ claim_code: string; link: string; status: string; hs_exempt: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function preview(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setCreated(null); setBusy(true);
    const body = /^\d{4,}$/.test(q.trim()) ? { action: "new_claim", prop_id: Number(q.trim()) } : { action: "new_claim", address: q.trim() };
    const r = await opsPost<{ ok: true; matches: NewClaimMatch[] }>(keyValue, body);
    setBusy(false);
    if (isErr(r)) { setErr(errText(r)); return; }
    setMatches(r.matches);
  }
  async function create(m: NewClaimMatch) {
    setErr(null); setBusy(true);
    const r = await opsPost<{ ok: true; claim_code: string; link: string; status: string; hs_exempt: boolean }>(keyValue, { action: "new_claim", prop_id: m.prop_id, create: true });
    setBusy(false);
    if (isErr(r)) { setErr(errText(r)); return; }
    setCreated(r); onCreated();
  }
  return (
    <>
      <form className="toolbar" onSubmit={preview}>
        <input className="input input-sm" style={{ minWidth: 260 }} placeholder="3675 Duval St — or a TCAD account number" aria-label="Address or account" value={q} onChange={(e) => setQ(e.target.value)} data-testid="newclaim-q" required />
        <button type="submit" className="btn btn-sm" aria-busy={busy} data-testid="btn-newclaim-preview">Preview</button>
      </form>
      {err && <div className="banner-error" role="alert">{err}</div>}
      {created && (
        <div className="card card-sm card-tint" data-testid="newclaim-created">
          <div className="eyebrow eyebrow-sm">Walkthrough claim</div>
          <div className="h3 mono">{created.claim_code}</div>
          <a href={created.link} className="link-arrow" target="_blank" rel="noreferrer">{created.link}</a>
          <div className="ds-row"><StatusBadge status={created.status} /><button type="button" className="btn btn-sm btn-neutral" onClick={() => navigator.clipboard?.writeText(created.link)}>Copy link</button>{created.hs_exempt && <span className="badge badge-sand">already exempt — test only</span>}</div>
        </div>
      )}
      {matches && (
        <div className="table-wrap" data-testid="newclaim-matches">
          {matches.length === 0 ? <div className="table-empty">No published property matches. The Mac CLI (`python -m cleanbill.ops.new_claim`) searches the full roll.</div> : (
            <table className="table table-dense">
              <thead><tr><th>Account</th><th>Situs</th><th>Owner</th><th>Flags</th><th>Lead</th><th className="num">Estimate</th><th></th></tr></thead>
              <tbody>{matches.map((m) => (
                <tr key={m.prop_id}>
                  <td className="mono">{m.prop_id}</td><td>{m.situs_full}</td><td className="fine">{m.owner_name}</td>
                  <td>{m.hs_exempt ? <span className="badge badge-sand">HS</span> : <span className="badge badge-ok">no HS</span>} {m.ov65_exempt && <span className="badge badge-neutral">OV65</span>}</td>
                  <td>{m.lead ? <><span className="mono">{m.lead.claim_code}</span> <span className="badge badge-neutral">{m.lead.status}</span></> : <span className="fine">none (Mac CLI)</span>}</td>
                  <td className="num">{m.lead ? moneyFloor(m.lead.est_refund_total) : "—"}{m.lead?.estimate_unconfirmed && <span className="fine"> ?</span>}</td>
                  <td>{m.lead && <button type="button" className="btn btn-sm" aria-busy={busy} onClick={() => create(m)} data-testid="btn-newclaim-create">Create</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}

function Selftest({ keyValue }: { keyValue: string }) {
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { pass: boolean; ms: number; error?: string }>>({});
  async function run(s: string) {
    setRunning(s);
    const r = await opsPost<{ ok: true; pass: boolean; ms: number }>(keyValue, { action: "run_selftest", scenario: s });
    setRunning(null);
    setResults((x) => ({ ...x, [s]: isErr(r) ? { pass: false, ms: 0, error: errText(r) } : { pass: r.pass, ms: r.ms } }));
  }
  return (
    <div className="toolbar card card-sm" style={{ padding: "8px 16px" }} data-testid="selftest">
      <span className="toolbar-title">Selftest</span>
      {SCENARIOS.map((s) => (
        <span key={s} className="ds-row" style={{ gap: 6 }}>
          <button type="button" className="btn btn-sm btn-outline" aria-busy={running === s} disabled={!!running} onClick={() => run(s)} data-testid={`btn-selftest-${s}`}>Run {s}</button>
          {results[s] && <span className={`badge ${results[s].pass ? "badge-ok" : "badge-bad"}`}>{results[s].pass ? "pass" : "fail"} · {(results[s].ms / 1000).toFixed(1)} s{results[s].error ? ` · ${results[s].error}` : ""}</span>}
        </span>
      ))}
      <span className="fine">~10–45 s each; touches only the synthetic lead.</span>
    </div>
  );
}

function ClaimDetail({ c, busy, onClose, act }: { c: OpsClaim; busy: string | null; onClose: () => void; act: (label: string, body: Record<string, unknown>) => Promise<boolean> }) {
  const [channel, setChannel] = useState("email");
  const [copied, setCopied] = useState<string | null>(null);
  const ex = c.extracted ?? {};
  const drafts = c.messages.filter((m) => m.agent_draft), others = c.messages.filter((m) => !m.agent_draft);
  const idLine = [ex.first_name, ex.middle_name, ex.last_name].filter(Boolean).join(" ");
  const idAddr = [ex.address_line1, ex.city, ex.state, ex.zip].filter(Boolean).join(", ");
  return (
    <aside className="drawer-panel" role="dialog" aria-label={`Claim ${c.claim_code ?? ""}`} aria-busy={!!busy}>
      <div className="drawer-head">
        <div><div className="eyebrow eyebrow-sm">Claim</div><b className="mono">{c.claim_code}</b> <StatusPill status={c.status} small /></div>
        <button type="button" className="drawer-close" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="drawer-body">
        {c.status_reason && <p className="fine">{c.status_reason}</p>}
        <div className="ledger">
          <div className="ledger-row"><span>Property</span><b>{c.situs_full}</b></div>
          <div className="ledger-row"><span>Owner of record</span><b>{c.owner_name}</b></div>
          <div className="ledger-row"><span>Customer</span><b>{c.full_name} · {c.email}{c.phone ? ` · ${c.phone}` : ""}</b></div>
          <div className="ledger-row"><span>Estimate</span><b className="num">{moneyFloor(c.est_refund_total)}</b></div>
          <div className="ledger-row"><span>Signed</span><b>{c.signed_at ? new Date(c.signed_at).toLocaleString("en-US") : "—"}</b></div>
          {c.account && <div className="ledger-row"><span>Account</span><b>{c.account.email}{c.account.card_on_file ? " · card on file" : ""}</b></div>}
        </div>
        <div>
          <div className="eyebrow eyebrow-sm">From the ID</div>
          {c.extracted ? <p className="text-body" style={{ fontSize: 14 }}>{idLine || "—"} · DOB {String(ex.dob ?? "—")} · {idAddr || "no address read"}<br /><span className="fine">ID number: on file, never shown (Tax Code §11.48)</span></p> : <p className="fine">No extraction yet.</p>}
        </div>
        <div>
          <div className="eyebrow eyebrow-sm">Findings</div>
          {c.findings.length === 0 ? <p className="fine">None.</p> : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">{c.findings.map((f, i) => <li key={i} style={{ fontSize: 14 }}><span className={`badge ${f.severity === "blocking" ? "badge-bad" : f.severity === "warning" ? "badge-sand" : "badge-neutral"}`}>{f.severity}</span> <span className="mono" style={{ fontSize: 12 }}>{f.code}</span> — {f.message}</li>)}</ul>
          )}
        </div>
        <div>
          <div className="eyebrow eyebrow-sm">Packet</div>
          {c.packet ? (
            <p style={{ fontSize: 14 }}>{c.packet.url ? <a className="btn btn-sm btn-outline" href={c.packet.url} target="_blank" rel="noreferrer" data-testid="packet-link">Open Form 50-114 (10-minute link)</a> : <span className="fine">no packet file</span>} <span className="fine">{c.packet.form_version} · generated {shortDate(c.packet.generated_at)}{c.packet.submitted_at ? ` · submitted ${shortDate(c.packet.submitted_at)} via ${c.packet.channel}` : ""}</span></p>
          ) : <p className="fine">No packet yet.</p>}
        </div>
        <div>
          <div className="eyebrow eyebrow-sm">Drafts (shadow mode)</div>
          {drafts.length === 0 ? <p className="fine">No drafts waiting.</p> : drafts.map((m) => (
            <div key={m.id} className="card card-sm" style={{ gap: 6, marginBottom: 8 }} data-testid="draft">
              <b style={{ fontSize: 14 }}>{m.subject}</b><span className="fine">{m.intent} · {shortDate(m.created_at)}</span>
              <p className="text-body" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</p>
              <div className="ds-row">
                <button type="button" className="btn btn-sm" aria-busy={busy === "Approve"} onClick={() => act("Approve", { action: "approve", message_id: m.id })} data-testid="btn-approve">Approve</button>
                <button type="button" className="btn btn-sm btn-neutral" aria-busy={busy === "Discard"} onClick={() => act("Discard", { action: "discard", message_id: m.id })} data-testid="btn-discard">Discard</button>
                <button type="button" className="btn btn-sm btn-neutral" onClick={() => { navigator.clipboard?.writeText(`${m.subject}\n\n${m.body}`); setCopied(m.id); }}>{copied === m.id ? "Copied" : "Copy text"}</button>
              </div>
            </div>
          ))}
          {others.length > 0 && <ul className="m-0 flex list-none flex-col gap-1 p-0">{others.map((m) => <li key={m.id} className="fine">{m.direction === "inbound" ? "←" : "→"} {m.subject ?? m.intent} · {shortDate(m.created_at)}{m.approved_at ? " · approved" : ""}{m.sent_at ? " · sent" : " · not sent (copy it into your mail client until Task 4)"}<button type="button" className="btn btn-sm btn-neutral" style={{ marginLeft: 8 }} onClick={() => navigator.clipboard?.writeText(`${m.subject}\n\n${m.body}`)}>Copy</button></li>)}</ul>}
        </div>
        <div>
          <div className="eyebrow eyebrow-sm">Actions</div>
          <div className="toolbar" style={{ padding: 0 }}>
            <select className="input input-sm" aria-label="Filing channel" value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!can.markFiled(c.status)}><option value="email">via e-mail</option><option value="portal">via TCAD portal</option><option value="mail">via mail</option></select>
            <button type="button" className="btn btn-sm" disabled={!can.markFiled(c.status)} aria-busy={busy === "Mark filed"} onClick={() => act("Mark filed", { action: "mark_filed", claim_id: c.id, channel })} data-testid="btn-mark-filed">Mark filed</button>
            <button type="button" className="btn btn-sm btn-neutral" disabled={!can.reprocess(c.status)} aria-busy={busy === "Reprocess"} onClick={() => act("Reprocess", { action: "reprocess", claim_id: c.id })} data-testid="btn-reprocess">Reprocess</button>
            <button type="button" className="btn btn-sm btn-bad" disabled={!can.withdraw(c.status)} aria-busy={busy === "Withdraw"} onClick={() => { if (confirm(`Withdraw claim ${c.claim_code}? The customer is not notified.`)) void act("Withdraw", { action: "withdraw", claim_id: c.id }); }} data-testid="btn-withdraw">Withdraw</button>
          </div>
          <p className="fine mt-2">Mark filed only from <i>ready to submit</i> (sets the filing date and drafts the &ldquo;submitted&rdquo; e-mail); Reprocess only for a claim stuck in <i>received</i>; Withdraw from any open status. Nothing here sends e-mail.</p>
        </div>
        <p className="fine">{BRAND} · claim {c.id}</p>
      </div>
    </aside>
  );
}
