"use client";
// The inline result (SPEC-06 §2/§4), the card step placeholder (SPEC-03, filled in by Task 3) and the confirmation screen.
import { useState } from "react";
import { type ClaimSummary, type Finding, postEvent, sendReply, submitClaim } from "@/lib/api";
import { CARD, DONE, RESULT } from "@/lib/copy";

export function ResultView({ code, claimId, claim, situs, onReprocess, onContinue }: {
  code: string; claimId: string; claim: ClaimSummary; situs: string; onReprocess: (newClaimId?: string) => void; onContinue: () => void;
}) {
  const blocking = claim.findings.filter((f) => f.severity === "blocking");
  const actions = new Set(blocking.map((f) => f.next_action));

  if (claim.status === "ready_to_submit") {
    return (
      <section data-testid="result-ready">
        <h1>{RESULT.readyTitle}</h1>
        <p>{RESULT.readyBody}</p>
        {claim.packet_url && (
          <a className="btn btn-secondary mt-2" href={claim.packet_url} target="_blank" rel="noopener" data-testid="packet-link"
            onClick={() => postEvent(code, "packet_viewed", { claim_id: claimId })}>{RESULT.viewPacket}</a>
        )}
        <InfoFindings findings={claim.findings} />
        <p className="note mt-3">{RESULT.readyNext}</p>
        <button className="btn mt-4" data-testid="btn-continue" onClick={onContinue}>{RESULT.continue}</button>
      </section>
    );
  }

  if (claim.status === "needs_review") {
    const err = blocking.find((f) => f.code === "processing_error");
    if (err) {
      return (
        <section data-testid="result-error">
          <h1>{RESULT.errorTitle}</h1>
          <p>{err.customer_message}</p>
          <a className="btn btn-secondary mt-3" href={`/claim/${code}/status`}>Claim status</a>
        </section>
      );
    }
    return (
      <section data-testid="result-review">
        <h1>{RESULT.reviewTitle}</h1>
        <ul className="list-none space-y-2 p-0">
          {blocking.map((f) => <li key={f.code} className="callout" data-code={f.code}>{f.customer_message}</li>)}
        </ul>
        {actions.has("confirm_typed") && <TypedConfirm code={code} prefill={claim.typed_prefill ?? {}} onSent={onReprocess} />}
        {!actions.has("confirm_typed") && actions.has("reply") && <ReplyBox code={code} claimId={claimId} />}
        <p className="note mt-4">{situs}</p>
      </section>
    );
  }

  // any other terminal state (filed, withdrawn, …) — point at the status page
  return (
    <section data-testid="result-other">
      <h1>{situs}</h1>
      <a className="btn btn-secondary mt-3" href={`/claim/${code}/status`}>Claim status</a>
    </section>
  );
}

function InfoFindings({ findings }: { findings: Finding[] }) {
  const info = findings.filter((f) => f.severity !== "blocking" && f.code !== "address_match" && f.code !== "name_match");
  if (!info.length) return null;
  return <ul className="note mt-3 list-disc pl-5">{info.map((f) => <li key={f.code}>{f.customer_message}</li>)}</ul>;
}

function ReplyBox({ code, claimId }: { code: string; claimId: string }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");
  return (
    <div className="mt-4" data-testid="reply-box">
      <label htmlFor="reply" className="block font-semibold">{RESULT.replyLabel}</label>
      <textarea id="reply" className="input min-h-28" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} disabled={state === "sent"} />
      {state === "sent" ? <p className="ok mt-2 font-semibold" role="status">{RESULT.replySent}</p> : (
        <button className="btn mt-2" disabled={!text.trim() || state === "busy"} onClick={async () => {
          setState("busy");
          const r = await sendReply(code, claimId, text.trim()).catch(() => null);
          setState(r && r.ok ? "sent" : "error");
        }}>{RESULT.replySend}</button>
      )}
      {state === "error" && <p className="err mt-2" role="alert">Couldn&apos;t send. Please try again.</p>}
    </div>
  );
}

/** SPEC-06 §4: the typed fallback — pre-filled with what the model read; the photo stays required for filing. */
function TypedConfirm({ code, prefill, onSent }: { code: string; prefill: Record<string, string>; onSent: (id?: string) => void }) {
  const [v, setV] = useState({ first_name: prefill.first_name ?? "", last_name: prefill.last_name ?? "", dob: prefill.dob ?? "", address_line1: prefill.address_line1 ?? "", city: prefill.city ?? "", zip: prefill.zip ?? "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const field = (k: keyof typeof v, label: string, extra: Record<string, string> = {}) => (
    <div className="mt-2"><label className="block text-[14px] font-semibold" htmlFor={`t_${k}`}>{label}</label>
      <input id={`t_${k}`} className="input" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} {...extra} /></div>
  );
  return (
    <div className="card mt-4" data-testid="typed-confirm">
      <div className="font-semibold">{RESULT.confirmTitle}</div>
      <p className="note mt-1">{RESULT.confirmHelp}</p>
      {field("first_name", "First name")}{field("last_name", "Last name")}
      {field("dob", "Date of birth", { type: "date" })}
      {field("address_line1", "Address as on your license", { autoComplete: "street-address" })}
      {field("city", "City")}{field("zip", "ZIP", { inputMode: "numeric", maxLength: "10" })}
      {err && <p className="err mt-2" role="alert">{err}</p>}
      <button className="btn mt-3" disabled={busy} onClick={async () => {
        setBusy(true); setErr(null);
        const fd = new FormData(); fd.set("c", code);
        fd.set("typed_first_name", v.first_name); fd.set("typed_last_name", v.last_name); fd.set("typed_dob", v.dob);
        fd.set("typed_address", v.address_line1); fd.set("typed_city", v.city); fd.set("typed_zip", v.zip);
        const r = await submitClaim(fd).catch(() => null);
        setBusy(false);
        if (r && r.ok) onSent(r.claim_id); else setErr((r && "reason" in r && r.reason) || "Couldn't send. Please try again.");
      }}>{RESULT.confirm}</button>
    </div>
  );
}

/** SPEC-03 §1/§3 — rendered only when NEXT_PUBLIC_STRIPE_ENABLED=true. Task 3 mounts the Payment Element here. */
export function CardStep({ code, claimId, onDone }: { code: string; claimId: string; onDone: () => void }) {
  return (
    <section data-testid="card-step">
      <h1>{CARD.title}</h1>
      <p>{CARD.body}</p>
      <button className="btn btn-secondary mt-4" data-testid="btn-skip-card" onClick={() => { postEvent(code, "card_skipped", { claim_id: claimId }); onDone(); }}>{CARD.skip}</button>
    </section>
  );
}

export function DoneScreen({ code }: { code: string }) {
  return (
    <section data-testid="done">
      <h1>{DONE.title}</h1>
      <p>{DONE.intro}</p>
      <ol className="card list-decimal space-y-2 pl-9">{DONE.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="mt-3">{DONE.questions}</p>
      <a className="btn btn-secondary mt-2" href={`/claim/${code}/status`}>{DONE.status}</a>
    </section>
  );
}
