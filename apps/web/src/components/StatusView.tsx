"use client";
// /claim/[code]/status (SPEC-04b §2): what happens next, the current state in plain English, packet download when ready.
import { useEffect, useState } from "react";
import { type ClaimLookup, type ClosedInfo, getClaim, postEvent } from "@/lib/api";
import { ERRORS, STATUS, STATUS_PAGE } from "@/lib/copy";

export function StatusView({ code }: { code: string }) {
  const [j, setJ] = useState<ClaimLookup | null | "offline">(null);
  useEffect(() => { getClaim(code).then(setJ).catch(() => setJ("offline")); }, [code]);

  if (j === null) return <p className="note" aria-live="polite">Loading…</p>;
  if (j === "offline") return <h1>{ERRORS.offline}</h1>;
  if (!j.ok && j.error === "rate_limited") return <h1>{ERRORS.rateLimited}</h1>;
  if (!j.ok && j.error !== "closed") return (<div><h1>{STATUS_PAGE.notFound}</h1><p>{ERRORS.notFoundHelp}</p></div>);

  const closed = !j.ok ? (j as ClosedInfo) : null;
  const status = closed?.claim?.status ?? (closed ? closed.status : "none");
  const s = STATUS[status] ?? STATUS.none;
  const situs = j.ok ? j.property.situs_full : closed!.property.situs_full;
  return (
    <section>
      <p className="note mb-1">{STATUS_PAGE.title}</p>
      <h1 data-testid="status-title">{s.title}</h1>
      <p className="note">{situs}</p>
      <p>{s.body}</p>
      {closed?.claim?.packet_url && (
        <a className="btn btn-secondary mt-2" href={closed.claim.packet_url} target="_blank" rel="noopener" data-testid="packet-link"
          onClick={() => postEvent(code, "packet_viewed", { claim_id: closed.claim!.id, from: "status" })}>{STATUS_PAGE.packet}</a>
      )}
      {closed?.claim && closed.claim.findings.some((f) => f.severity === "blocking") && (
        <ul className="mt-3 list-none space-y-2 p-0">
          {closed.claim.findings.filter((f) => f.severity === "blocking").map((f) => <li key={f.code} className="callout">{f.customer_message}</li>)}
        </ul>
      )}
      <a className="mt-4 inline-block" href={`/claim/${code}`}>{STATUS_PAGE.back}</a>
    </section>
  );
}
