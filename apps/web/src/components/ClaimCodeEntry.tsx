"use client";
// /claim — the landing from the mailed letter (SPEC-07 §11): default → error (not found) → found (confirm the property)
// → /claim/[code]. The code is normalised as it is typed (uppercase, dashes, O→0, I→1); GET /claim?c decides whether it
// exists. A code whose lead is already claimed goes straight to its status page.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CODE_MASK, getClaim, type LeadInfo, maskCode, normalizeCode } from "@/lib/api";
import { CODE_PAGE, ERRORS } from "@/lib/copy";
import { maskAccount, moneyFloor } from "@/lib/format";
import { Field } from "./ui";

type State = { kind: "idle" } | { kind: "busy" } | { kind: "error"; msg: string } | { kind: "found"; code: string; info: LeadInfo };

export function ClaimCodeEntry() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(raw);
    if (!code) { setState({ kind: "error", msg: CODE_PAGE.notFound }); return; }
    setState({ kind: "busy" });
    const j = await getClaim(code).catch(() => null);
    if (!j) { setState({ kind: "error", msg: ERRORS.offline }); return; }
    if (j.ok) { setState({ kind: "found", code, info: j }); return; }
    if (j.error === "closed") { router.push(`/claim/${code}/status`); return; }
    setState({ kind: "error", msg: j.error === "rate_limited" ? ERRORS.rateLimited : CODE_PAGE.notFound });
  };

  if (state.kind === "found") {
    const { info, code } = state;
    return (
      <div className="card card-elevated" style={{ padding: 32 }} data-testid="code-found">
        <h1 className="h2" style={{ fontSize: 30 }}>{CODE_PAGE.foundTitle}</h1>
        <div className="card card-tint card-sm" style={{ gap: 6 }}>
          <div className="h3" style={{ fontSize: 18 }}>{info.property.situs_full}</div>
          <div className="fine" style={{ color: "var(--color-primary-strong)" }}>{CODE_PAGE.foundAccount(maskAccount(info.property.prop_id), info.property.owner_name)}</div>
          <div className="fine" style={{ color: "var(--color-primary-strong)" }}>{CODE_PAGE.foundEstimate(moneyFloor(info.lead.est_refund_total))}</div>
        </div>
        <Link href={`/claim/${code}`} className="btn btn-l btn-block">{CODE_PAGE.yes}</Link>
        <button type="button" className="btn btn-neutral btn-block" onClick={() => { setRaw(""); setState({ kind: "idle" }); }}>{CODE_PAGE.notMine}</button>
        <p className="fine text-center">{CODE_PAGE.fine}</p>
      </div>
    );
  }

  const err = state.kind === "error" ? state.msg : null;
  return (
    <form className="card card-elevated" style={{ padding: 32 }} onSubmit={submit} data-testid="code-entry">
      <h1 className="h2" style={{ fontSize: 30 }}>{CODE_PAGE.title}</h1>
      <p className="text-body">{CODE_PAGE.body}</p>
      <Field id="code" label={CODE_PAGE.label} error={err} hint={CODE_PAGE.hint}>
        <input id="code" name="c" className="input input-code" placeholder={CODE_MASK} autoComplete="off" autoCapitalize="characters" spellCheck={false} inputMode="text"
          value={raw} onChange={(e) => { setRaw(maskCode(e.target.value)); if (state.kind === "error") setState({ kind: "idle" }); }} aria-invalid={!!err} />
      </Field>
      <button type="submit" className="btn btn-l btn-block" disabled={state.kind === "busy"}>{state.kind === "busy" ? "…" : err ? CODE_PAGE.tryAgain : CODE_PAGE.open}</button>
      <p className="fine text-center">{err ? null : <>{CODE_PAGE.noLetter} </>}<Link href="/#start" className="font-semibold">{CODE_PAGE.byAddress}</Link></p>
    </form>
  );
}
