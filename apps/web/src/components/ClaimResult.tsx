"use client";
// The inline result (SPEC-06 §2/§4), the card step placeholder (SPEC-03, filled in by Task 3) and the confirmation
// screen (SPEC-07 §02 screen 6: navy, check circle, DONE eyebrow, "We have everything, {first name}.", three steps).
import Link from "next/link";
import { useState } from "react";
import { type ClaimSummary, type Finding, postEvent, sendReply, submitClaim } from "@/lib/api";
import { CARD, DONE, RESULT } from "@/lib/copy";
import { Field, Progress } from "./ui";

export function ResultView({ code, claimId, claim, situs, onReprocess, onContinue }: {
  code: string; claimId: string; claim: ClaimSummary; situs: string; onReprocess: (newClaimId?: string) => void; onContinue: () => void;
}) {
  const blocking = claim.findings.filter((f) => f.severity === "blocking");
  const actions = new Set(blocking.map((f) => f.next_action));

  if (claim.status === "ready_to_submit") {
    return (
      <section data-testid="result-ready" className="flex flex-col gap-4">
        <Progress done={5} total={5} thin />
        <h1 className="flow-title"><span className="dot-ok" aria-hidden="true" />{RESULT.readyTitle}</h1>
        <p className="text-body">{RESULT.readyBody}</p>
        {claim.packet_url && (
          <a className="btn btn-outline self-start" href={claim.packet_url} target="_blank" rel="noopener" data-testid="packet-link" onClick={() => postEvent(code, "packet_viewed", { claim_id: claimId })}>{RESULT.viewPacket}</a>
        )}
        <InfoFindings findings={claim.findings} />
        <p className="fine">{RESULT.readyNext}</p>
        <div className="flow-cta"><div className="flow-cta-inner"><button className="btn btn-l btn-block" data-testid="btn-continue" onClick={onContinue}>{RESULT.continue}</button></div></div>
      </section>
    );
  }

  if (claim.status === "needs_review") {
    const err = blocking.find((f) => f.code === "processing_error");
    if (err) {
      return (
        <section data-testid="result-error" className="flex flex-col gap-4">
          <h1 className="flow-title">{RESULT.errorTitle}</h1>
          <p className="text-body">{err.customer_message}</p>
          <Link className="btn btn-outline self-start" href={`/claim/${code}/status`}>{RESULT.status}</Link>
        </section>
      );
    }
    return (
      <section data-testid="result-review" className="flex flex-col gap-4">
        <h1 className="flow-title">{RESULT.reviewTitle}</h1>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {blocking.map((f) => <li key={f.code} className="card card-tint card-sm text-[14px] text-body" data-code={f.code}>{f.customer_message}</li>)}
        </ul>
        {actions.has("confirm_typed") && <TypedConfirm code={code} prefill={claim.typed_prefill ?? {}} onSent={onReprocess} />}
        {!actions.has("confirm_typed") && actions.has("reply") && <ReplyBox code={code} claimId={claimId} />}
        <p className="fine">{situs}</p>
      </section>
    );
  }

  // any other terminal state (filed, withdrawn, …) — point at the status page
  return (
    <section data-testid="result-other" className="flex flex-col gap-4">
      <h1 className="flow-title">{situs}</h1>
      <Link className="btn btn-outline self-start" href={`/claim/${code}/status`}>{RESULT.status}</Link>
    </section>
  );
}

function InfoFindings({ findings }: { findings: Finding[] }) {
  const info = findings.filter((f) => f.severity !== "blocking" && f.code !== "address_match" && f.code !== "name_match");
  if (!info.length) return null;
  return <ul className="fine m-0 list-disc pl-5">{info.map((f) => <li key={f.code}>{f.customer_message}</li>)}</ul>;
}

export function ReplyBox({ code, claimId, compact = false }: { code: string; claimId: string; compact?: boolean }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  return (
    <div className="flex flex-col gap-2" data-testid="reply-box">
      <Field id="reply" label={RESULT.replyLabel}>
        <textarea id="reply" className="input" style={{ minHeight: compact ? 88 : 112 }} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={state === "sent"} />
      </Field>
      {state === "sent" ? <p className="text-[14px] font-semibold" style={{ color: "var(--color-success)" }} role="status">{RESULT.replySent}</p> : (
        <button className="btn self-start" disabled={!text.trim() || state === "busy"} onClick={async () => {
          setState("busy");
          const r = await sendReply(code, claimId, text.trim()).catch(() => null);
          setState(r && r.ok ? "sent" : "error");
        }}>{RESULT.replySend}</button>
      )}
      {state === "error" && <p className="field-error" role="alert">{RESULT.replyFailed}</p>}
    </div>
  );
}

/** SPEC-06 §4: the typed fallback — pre-filled with what the model read; the photo stays required for filing. */
function TypedConfirm({ code, prefill, onSent }: { code: string; prefill: Record<string, string>; onSent: (id?: string) => void }) {
  const [v, setV] = useState({ first_name: prefill.first_name ?? "", last_name: prefill.last_name ?? "", dob: prefill.dob ?? "", address_line1: prefill.address_line1 ?? "", city: prefill.city ?? "", zip: prefill.zip ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = (k: keyof typeof v, label: string, extra: Record<string, string> = {}) => (
    <Field id={`t_${k}`} label={label}><input id={`t_${k}`} className="input" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} /></Field>
  );
  return (
    <div className="card" data-testid="typed-confirm">
      <div className="h3" style={{ fontSize: 17 }}>{RESULT.confirmTitle}</div>
      <p className="fine">{RESULT.confirmHelp}</p>
      <div className="grid grid-cols-2 gap-3">{field("first_name", "First name")}{field("last_name", "Last name")}</div>
      {field("dob", "Date of birth", { type: "date" })}
      {field("address_line1", "Address as on your license", { autoComplete: "street-address" })}
      <div className="grid grid-cols-[1fr_110px] gap-3">{field("city", "City")}{field("zip", "ZIP", { inputMode: "numeric", maxLength: "10" })}</div>
      {err && <p className="field-error" role="alert">{err}</p>}
      <button className="btn self-start" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        const fd = new FormData(); fd.set("c", code);
        fd.set("typed_first_name", v.first_name); fd.set("typed_last_name", v.last_name); fd.set("typed_dob", v.dob);
        fd.set("typed_address", v.address_line1); fd.set("typed_city", v.city); fd.set("typed_zip", v.zip);
        const r = await submitClaim(fd).catch(() => null);
        setBusy(false);
        if (r && r.ok) onSent(r.claim_id); else setErr((r && "reason" in r && r.reason) || RESULT.replyFailed);
      }}>{RESULT.confirm}</button>
    </div>
  );
}

/** SPEC-03 §1/§3 — rendered only when NEXT_PUBLIC_STRIPE_ENABLED=true. Task 3 mounts the Payment Element here. */
export function CardStep({ code, claimId, onDone }: { code: string; claimId: string; onDone: () => void }) {
  return (
    <section data-testid="card-step" className="flex flex-col gap-4">
      <Progress done={5} total={5} thin />
      <h1 className="flow-title">{CARD.title}</h1>
      <p className="text-body">{CARD.body}</p>
      <button className="btn btn-neutral self-start" data-testid="btn-skip-card" onClick={() => { postEvent(code, "card_skipped", { claim_id: claimId }); onDone(); }}>{CARD.skip}</button>
    </section>
  );
}

export function DoneScreen({ code, firstName }: { code: string; firstName: string | null }) {
  return (
    <section data-testid="done" className="flex flex-col gap-5 pb-8" style={{ color: "var(--color-on-dark-strong)", minHeight: "70vh" }}>
      <span className="check-circle" aria-hidden="true">✓</span>
      <div className="eyebrow eyebrow-sm eyebrow-soft">{DONE.eyebrow}</div>
      <h1 className="flow-title" style={{ fontSize: 28, color: "var(--color-on-dark-strong)" }}>{DONE.title(firstName)}</h1>
      <p style={{ color: "var(--color-on-dark)" }}>{DONE.intro}</p>
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {DONE.steps.map((s, i) => <li key={s} className="grid grid-cols-[20px_1fr] gap-2 text-[15px]"><span className="font-bold" style={{ color: "var(--color-primary-soft)" }}>{i + 1}</span><span>{s}</span></li>)}
      </ol>
      <p className="fine" style={{ color: "var(--color-on-dark)" }}>{DONE.questions}</p>
      <div className="flow-cta"><div className="flow-cta-inner"><Link className="btn btn-l btn-block btn-white" href={`/claim/${code}/status`}>{DONE.status}</Link></div></div>
    </section>
  );
}
