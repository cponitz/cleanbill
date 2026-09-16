"use client";
// /claim/[code]/status — the customer portal view of one claim (SPEC-07 §10), keyed by the claim code rather than a
// login (ADR 0018): claim header + status card with the six-stage progress row, documents, messages, estimate, billing,
// other properties. Data: GET /claim?c (closed lead → claim with timeline, messages, card_on_file; lead estimate).
import Link from "next/link";
import { useEffect, useState } from "react";
import { type ClaimLookup, type ClosedInfo, getClaim, postEvent, STRIPE_ENABLED } from "@/lib/api";
import { ERRORS, PORTAL, STATUS, SUPPORT_EMAIL } from "@/lib/copy";
import { byYear, feeOn, initials, moneyFloor, shortDate } from "@/lib/format";
import { stageIndex, TERMINAL } from "@/lib/status";
import { ReplyBox } from "./ClaimResult";
import { SiteNav } from "./SiteNav";
import { StatusPill } from "./ui";

export function StatusView({ code }: { code: string }) {
  const [j, setJ] = useState<ClaimLookup | null | "offline">(null);
  const [compose, setCompose] = useState(false);
  useEffect(() => { getClaim(code).then(setJ).catch(() => setJ("offline")); }, [code]);

  const closed = j && j !== "offline" && !j.ok && j.error === "closed" ? (j as ClosedInfo) : null;
  const claim = closed?.claim ?? null;
  const first = claim?.first_name ?? null;

  return (
    <>
      <SiteNav portal={{ initials: initials(first), name: first }} />
      <div className="wrap section">
        {j === null && (
          <div className="grid gap-6 md:grid-cols-[1fr_360px]" aria-busy="true" aria-live="polite">
            <div className="flex flex-col gap-4"><div className="skeleton" style={{ height: 20, width: 220 }} /><div className="skeleton" style={{ height: 40, width: "60%" }} /><div className="skeleton" style={{ height: 220 }} /></div>
            <div className="skeleton" style={{ height: 180 }} />
          </div>
        )}
        {j === "offline" && <h1 className="h2">{ERRORS.offline}</h1>}
        {j && j !== "offline" && !j.ok && j.error === "rate_limited" && <h1 className="h2">{ERRORS.rateLimited}</h1>}
        {j && j !== "offline" && !j.ok && j.error !== "closed" && j.error !== "rate_limited" && (
          <div className="card card-elevated mx-auto flex flex-col gap-3" style={{ maxWidth: 480 }}>
            <h1 className="h3" style={{ fontSize: 22 }}>{PORTAL.notFound}</h1>
            <p className="text-body">{ERRORS.notFoundHelp}</p>
            <Link href="/claim" className="btn self-start">{PORTAL.checkAddress}</Link>
          </div>
        )}
        {j && j !== "offline" && j.ok && (
          <div className="card card-elevated mx-auto flex flex-col gap-3" style={{ maxWidth: 480 }} data-testid="status-empty">
            <h1 className="h3" style={{ fontSize: 22 }} data-testid="status-title">{STATUS.none.title}</h1>
            <p className="text-body">{STATUS.none.body}</p>
            <p className="fine">{j.property.situs_full}</p>
            <Link href={`/claim/${code}`} className="btn self-start">{PORTAL.back}</Link>
          </div>
        )}
        {closed && (() => {
          const status = claim?.status ?? closed.status;
          const s = STATUS[status] ?? STATUS.none;
          const stage = claim ? stageIndex(status) : -1;
          const terminal = TERMINAL.has(status);
          const t = claim?.timeline;
          const dates = [t?.received, t?.id_checked, t?.approved, t?.filed, t?.decided, t?.refunded].map(shortDate);
          const est = closed.lead;
          const hasEstimate = typeof est.est_refund_total === "number";
          const packetLabel = status === "ready_to_submit" ? PORTAL.packetReady : PORTAL.packet;
          return (
            <div className="flex flex-col gap-6 md:grid md:grid-cols-[1fr_360px] md:items-start md:gap-8">
              <div className="contents md:flex md:flex-col md:gap-6">
                <header className="order-1 flex flex-wrap items-end justify-between gap-4 md:order-none" id="claim">
                  <div className="flex flex-col gap-1">
                    <div className="fine">{PORTAL.service} · <span className="mono">{code}</span></div>
                    <h1 className="h2" style={{ fontSize: 32 }}>{closed.property.situs_full}</h1>
                  </div>
                  {claim && <StatusPill status={status} />}
                </header>

                <section className="card order-2 md:order-none" style={{ gap: 16 }} aria-labelledby="status-title">
                  <div className="flex flex-col gap-2">
                    <h2 className="h3" style={{ fontSize: 22 }} id="status-title" data-testid="status-title">{s.title}</h2>
                    <p className="body-lg">{s.body}</p>
                  </div>
                  {claim && (
                    <ol className="m-0 grid list-none grid-cols-3 gap-3 p-0 md:grid-cols-6" aria-label="Progress">
                      {PORTAL.stages.map((label, i) => {
                        const done = i <= stage && !(terminal && i === stage && status === "denied" ? false : false);
                        const current = i === stage;
                        const failed = terminal && current;
                        return (
                          <li key={label} className="flex flex-col gap-1.5">
                            <span className="block h-1.5 rounded-[3px]" style={{ background: done ? (failed ? "var(--error)" : "var(--teal)") : "var(--border)" }} />
                            <span className="text-[13px] font-semibold" style={{ color: current ? (failed ? "var(--error)" : "var(--teal)") : done ? "var(--ink)" : "var(--placeholder)" }}>{label}</span>
                            <span className="text-[12px]" style={{ color: done ? "var(--muted)" : "var(--placeholder)" }}>{dates[i] || (done ? "" : PORTAL.expected[i])}</span>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                  {claim && claim.findings.some((f) => f.severity === "blocking") && (
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {claim.findings.filter((f) => f.severity === "blocking").map((f) => <li key={f.code} className="card card-tint card-sm text-[14px] text-body">{f.customer_message}</li>)}
                    </ul>
                  )}
                  {claim && ["needs_dl_update", "needs_review", "submitted", "processing"].includes(status) && (
                    <Link href={`/claim/${code}`} className="btn btn-outline self-start">{PORTAL.back}</Link>
                  )}
                </section>

                <div className="contents md:grid md:grid-cols-2 md:gap-5">
                  <section className="card order-4 md:order-none" id="documents" style={{ gap: 0 }}>
                    <h2 className="h3 pb-3">{PORTAL.documents}</h2>
                    <div className="ledger">
                      <div className="ledger-row !text-[15px]">
                        <span>{claim?.packet_url ? packetLabel : PORTAL.packetPending}</span>
                        {claim?.packet_url ? <a href={claim.packet_url} target="_blank" rel="noopener" className="font-semibold" data-testid="packet-link" onClick={() => postEvent(code, "packet_viewed", { claim_id: claim.id, from: "status" })}>{PORTAL.pdf}</a> : <span className="fine">{PORTAL.packetPendingNote}</span>}
                      </div>
                      <div className="ledger-row !text-[15px]"><span>{PORTAL.agreement}</span><Link href={`/agreement/${code}`} className="font-semibold">{PORTAL.view}</Link></div>
                      <div className="ledger-row !text-[15px]"><span className="muted">{PORTAL.license}</span><span className="fine">{PORTAL.licenseNote}</span></div>
                    </div>
                  </section>
                  <section className="card order-5 md:order-none" id="messages" style={{ gap: 0 }}>
                    <h2 className="h3 pb-3">{PORTAL.messages}</h2>
                    <div className="ledger">
                      {(claim?.messages ?? []).length === 0 && <p className="fine py-3">{PORTAL.noMessages}</p>}
                      {(claim?.messages ?? []).map((m, i) => (
                        <div key={i} className="ledger-row !flex-col !items-start !gap-0.5 !text-[15px]"><span className="font-semibold text-ink">{m.subject || (m.direction === "inbound" ? "Your message" : "Message")}</span><span className="fine">{shortDate(m.at)}</span></div>
                      ))}
                    </div>
                    {claim && !compose && <button type="button" className="link-arrow mt-3 self-start border-0 bg-transparent p-0" onClick={() => setCompose(true)}>{PORTAL.send}</button>}
                    {claim && compose && <div className="mt-3"><ReplyBox code={code} claimId={claim.id} compact /></div>}
                  </section>
                </div>
              </div>

              <aside className="contents md:flex md:flex-col md:gap-5">
                {hasEstimate && (
                  <section className="card order-3 md:order-none" style={{ gap: 8 }}>
                    <div className="eyebrow eyebrow-sm" style={{ color: "var(--muted)" }}>{PORTAL.estimate}</div>
                    <div className="amount" style={{ fontSize: 36 }}>{moneyFloor(est.est_refund_total)}</div>
                    <div className="ledger mt-1">
                      {byYear(est.est_refund_by_year).map(([y, v]) => <div key={y} className="ledger-row !py-2 !text-[15px]"><span>{PORTAL.yearRow(y)}</span><b>{moneyFloor(v)}</b></div>)}
                      <div className="ledger-row !py-2 !text-[15px]"><span>{PORTAL.fee}</span><span>{feeOn(est.est_refund_total)}</span></div>
                    </div>
                  </section>
                )}
                <section className="card order-6 md:order-none" id="billing" style={{ gap: 10 }}>
                  <h2 className="h3">{PORTAL.billing}</h2>
                  <p className="text-[15px] text-body">{claim?.card_on_file ? PORTAL.card : STRIPE_ENABLED ? PORTAL.noCard : `We invoice by email after the Travis County Tax Office issues the refund. Nothing is charged before then. Questions: ${SUPPORT_EMAIL}.`}</p>
                  {STRIPE_ENABLED && !claim?.card_on_file && <span className="btn btn-outline btn-block" aria-disabled="true">{PORTAL.addCard}</span>}
                </section>
                <section className="card card-sand order-7 md:order-none" style={{ gap: 8 }}>
                  <h2 className="h3" style={{ fontSize: 18 }}>{PORTAL.other}</h2>
                  <p className="text-[15px]">{PORTAL.otherBody}</p>
                  <Link href="/#start" className="link-arrow" style={{ color: "var(--sand-text)" }}>{PORTAL.addProperty}</Link>
                </section>
              </aside>
            </div>
          );
        })()}
      </div>
    </>
  );
}
