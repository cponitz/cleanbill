"use client";
// The signup flow (SPEC-07 §02 layout; SPEC-04b §2, SPEC-06b, SPEC-02 §1/§6 behaviour): estimate → eligibility → typed
// pre-check + license photo → contact → review & sign → inline result (poll) → card (flag) → done. A code whose lead is
// already claimed opens straight into the fix screen (needs_dl_update), the result (submitted/processing/needs_review/ready)
// or the status summary. Every string comes from lib/copy.ts; every network call from lib/api.ts. The element ids and
// data-testids are the contract with eval/web_smoke.py.
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  type ClaimLookup, type ClaimSummary, type ClosedInfo, getClaim, type LeadInfo, postEvent, precheck, STRIPE_ENABLED, submitClaim, waitForResult,
} from "@/lib/api";
import { CONTACT, ELIGIBILITY, ERRORS, ESTIMATE, FLOW, LICENSE, RESULT, SIGN, STATUS, TCAD_URL } from "@/lib/copy";
import { byYear, moneyFloor } from "@/lib/format";
import { toJpegIfHeic } from "@/lib/heic";
import { FixScreen } from "./FixScreen";
import { CardStep, DoneScreen, ResultView } from "./ClaimResult";
import { Checkbox, ChoiceGroup, ErrorBanner, Field, Progress, StatusPill } from "./ui";

type Phase = "loading" | "notfound" | "offline" | "ratelimited" | "estimate" | "eligibility" | "license" | "contact" | "sign" | "submitting" | "result" | "fix" | "card" | "done" | "closed";
const STEP: Partial<Record<Phase, number>> = { estimate: 1, eligibility: 2, license: 3, contact: 4, sign: 5, submitting: 5 };

const MAX_BYTES = 15 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function ClaimFlow({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<LeadInfo | null>(null);
  const [closed, setClosed] = useState<ClosedInfo | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimSummary | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // form state
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState({ name: "", address: "", zip: "" });
  const [pre, setPre] = useState<{ match: boolean } | null>(null);
  const [preBusy, setPreBusy] = useState(false);
  const [front, setFront] = useState<File | null>(null);
  const [back, setBack] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [contact, setContact] = useState({ full_name: "", email: "", phone: "" });
  const [consents, setConsents] = useState({ agree_terms: false, agree_esign: false, agree_free: false });
  const [signature, setSignature] = useState("");
  const topRef = useRef<HTMLDivElement>(null);
  const preTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const situs = info?.property.situs_full ?? closed?.property.situs_full ?? "";
  const years = (info?.lead.refund_years ?? closed?.lead.refund_years ?? []).slice().sort();
  const earliest = info?.earliest_year ?? years[0] ?? new Date().getFullYear() - 2;

  const routeClosed = useCallback((j: ClosedInfo) => {
    setClosed(j);
    const c = j.claim;
    if (!c) { setPhase("closed"); return; }
    setClaimId(c.id);
    if (c.first_name) setFirstName(c.first_name);
    if (c.status === "needs_dl_update") { setPhase("fix"); postEvent(code, "dl_fix_started", { claim_id: c.id }); return; }
    if (["submitted", "processing"].includes(c.status)) { setPhase("result"); return; }
    setResult(c); setPhase("result");
  }, [code]);

  useEffect(() => {
    let alive = true;
    getClaim(code).then((j: ClaimLookup) => {
      if (!alive) return;
      if (j.ok) { setInfo(j); setPhase("estimate"); return; }
      if (j.error === "closed") { routeClosed(j as ClosedInfo); return; }
      setPhase(j.error === "rate_limited" ? "ratelimited" : "notfound");
    }).catch(() => alive && setPhase("offline"));
    return () => { alive = false; };
  }, [code, routeClosed]);

  // the inline-validation poll (SPEC-06 §2): every 2 s, max 30 s
  useEffect(() => {
    if (phase !== "result" || !claimId || result) return;
    let alive = true;
    waitForResult(code, claimId).then((r) => {
      if (!alive) return;
      if (!r) { setTimedOut(true); return; }
      setResult(r);
      postEvent(code, "validation_shown", { claim_id: claimId, status: r.status, codes: r.findings.map((f) => f.code) });
      if (r.status === "needs_dl_update") { setPhase("fix"); postEvent(code, "dl_fix_started", { claim_id: claimId }); }
    });
    return () => { alive = false; };
  }, [phase, claimId, result, code]);

  const go = (p: Phase) => { setErrors([]); setPhase(p); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // typed pre-check: on blur, and debounced 400 ms while typing (SPEC-07 "address-match quick check")
  const runPrecheck = useCallback(async (t = typed) => {
    if (!t.address.trim()) { setPre(null); return; }
    setPreBusy(true);
    const r = await precheck(code, t.address, t.zip).catch(() => null);
    setPreBusy(false);
    setPre(r && r.ok ? { match: r.match } : null);
  }, [code, typed]);
  const typedChange = (next: typeof typed) => {
    setTyped(next);
    if (preTimer.current) clearTimeout(preTimer.current);
    if (next.address.trim().length >= 6) preTimer.current = setTimeout(() => runPrecheck(next), 400);
  };

  const pickFile = async (f: File | null, which: "front" | "back") => {
    if (!f) { (which === "front" ? setFront : setBack)(null); return; }
    setConverting(true);
    try {
      const file = await toJpegIfHeic(f);
      if (file.size > MAX_BYTES || !MIMES.has(file.type)) { setErrors([LICENSE.fileTooBig]); (which === "front" ? setFront : setBack)(null); return; }
      setErrors([]); (which === "front" ? setFront : setBack)(file);
    } catch { setErrors([LICENSE.fileTooBig]); } finally { setConverting(false); }
  };

  const eligibilityComplete = ["owned_jan1", "primary", "other_hs", "prev_homestead", "household"].every((k) => answers[k]);
  const signReady = Object.values(consents).every(Boolean) && signature.trim().split(/\s+/).length >= 2;

  const submit = async () => {
    const errs: string[] = [];
    if (!contact.full_name || !contact.email || !signature) errs.push("Name, email, and typed signature are required.");
    if (!Object.values(consents).every(Boolean)) errs.push("Please check all three agreement boxes.");
    if (!front) errs.push("Please add a photo of the front of your license.");
    if (signature && contact.full_name && signature.toLowerCase().replace(/\s+/g, " ").trim() !== contact.full_name.toLowerCase().replace(/\s+/g, " ").trim()) errs.push(SIGN.sigMismatch);
    if (errs.length) { setErrors(errs); return; }
    setPhase("submitting");
    const fd = new FormData();
    fd.set("c", code);
    for (const [k, v] of Object.entries(answers)) fd.set(k, v);
    fd.set("full_name", contact.full_name); fd.set("email", contact.email); fd.set("phone", contact.phone);
    for (const k of Object.keys(consents)) fd.set(k, "on");
    fd.set("signature_name", signature);
    fd.set("dl_front", front!); if (back) fd.set("dl_back", back);
    if (typed.address) { fd.set("typed_address", typed.address); fd.set("typed_zip", typed.zip); if (typed.name) fd.set("typed_name", typed.name); }
    const j = await submitClaim(fd).catch(() => null);
    if (!j || !j.ok) { setErrors(j && "errors" in j && j.errors ? j.errors : [ERRORS.generic]); setPhase("sign"); return; }
    setClaimId(j.claim_id); setFirstName(j.first_name ?? contact.full_name.split(" ")[0] ?? null); setResult(null); setTimedOut(false); go("result");
  };

  // after a re-upload / typed confirmation the API set the claim to `processing`: poll again
  const reprocess = (newClaimId?: string) => { if (newClaimId) setClaimId(newClaimId); setResult(null); setTimedOut(false); go("result"); };

  const step = STEP[phase];
  const chrome = (title: string, children: ReactNode, cta?: ReactNode, back?: Phase) => (
    <>
      <Progress done={step ?? 5} total={5} thin label={`Step ${step ?? 5} of 5`} />
      <div className="flex items-baseline justify-between gap-4">
        {step ? <div className="flow-step">{FLOW.step(step, FLOW.names[step - 1])}</div> : <span />}
        {back && <button type="button" className="fine font-semibold" style={{ color: "var(--teal)", background: "none", border: 0, padding: 0, cursor: "pointer" }} onClick={() => go(back)}>← {FLOW.back}</button>}
      </div>
      <h1 className="flow-title">{title}</h1>
      {children}
      {cta && <div className="flow-cta"><div className="flow-cta-inner">{cta}</div></div>}
    </>
  );

  return (
    <div ref={topRef} className={phase === "done" ? "flow-dark" : ""}>
      <div className="flow flex flex-col gap-4 pt-6">
        {phase === "loading" && (<div className="flex flex-col gap-4" aria-live="polite" aria-busy="true"><Progress done={0} total={5} thin /><div className="skeleton" style={{ height: 28, width: "70%" }} /><div className="skeleton" style={{ height: 160 }} /><div className="skeleton" style={{ height: 90 }} /><span className="sr-only">{FLOW.loading}</span></div>)}
        {phase === "notfound" && (<div className="flex flex-col gap-3"><h1 className="flow-title">{ERRORS.notFound}</h1><p className="text-body">{ERRORS.notFoundHelp}</p></div>)}
        {phase === "ratelimited" && (<h1 className="flow-title">{ERRORS.rateLimited}</h1>)}
        {phase === "offline" && (<div className="flex flex-col gap-4"><h1 className="flow-title">{ERRORS.offline}</h1><button className="btn btn-l" onClick={() => location.reload()}>{ERRORS.retry}</button></div>)}

        {phase === "closed" && closed && (
          <div className="flex flex-col gap-4" data-testid="closed">
            <StatusPill status={closed.status} />
            <h1 className="flow-title">{situs}</h1>
            <p className="text-body">{(STATUS[closed.status] ?? STATUS.none).title}</p>
            <p className="fine">{(STATUS[closed.status] ?? STATUS.none).body}</p>
            <Link className="btn btn-outline self-start" href={`/claim/${code}/status`}>{RESULT.status}</Link>
          </div>
        )}

        {phase === "estimate" && info && chrome(info.property.situs_full, (
          <section data-testid="estimate" className="flex flex-col gap-4">
            <p className="fine">{ESTIMATE.account(info.property.prop_id, info.property.owner_name)}</p>
            <div className="card card-tint" style={{ gap: 8 }}>
              <div className="fine" style={{ color: "var(--teal-deep)", fontWeight: 500 }}>{ESTIMATE.refundLabel}</div>
              <div className="amount" data-testid="refund">{moneyFloor(info.lead.est_refund_total)}</div>
              <ul className="m-0 mt-2 list-none p-0 text-[15px] text-body">
                {byYear(info.lead.est_refund_by_year).map(([y, t]) => <li key={y}>{ESTIMATE.yearLine(y, moneyFloor(t))}</li>)}
              </ul>
              <p className="text-[15px] font-medium" style={{ color: "var(--teal-deep)" }}>{ESTIMATE.forward(moneyFloor(info.lead.est_forward_annual))}</p>
            </div>
            <p className="fine">{ESTIMATE.deadline(earliest, info.deadline)}</p>
            <div className="card card-dark card-sm"><p className="text-[15px]">{ESTIMATE.free.split("traviscad.org")[0]}<a href={TCAD_URL} target="_blank" rel="noopener" style={{ color: "#fff", textDecoration: "underline" }}>traviscad.org</a>{ESTIMATE.free.split("traviscad.org")[1]}</p></div>
            <p className="fine">{ESTIMATE.disclaimer}</p>
          </section>
        ), <button className="btn btn-l btn-block" data-testid="btn-continue" onClick={() => go("eligibility")}>{FLOW.continueCta}</button>)}

        {phase === "eligibility" && chrome(ELIGIBILITY.title, (
          <section className="flex flex-col gap-5">
            <ChoiceGroup name="owned_jan1" label={ELIGIBILITY.q1(earliest)} value={answers.owned_jan1} onChange={(v) => setAnswers({ ...answers, owned_jan1: v })} options={[["yes", ELIGIBILITY.yes], ["no", ELIGIBILITY.q1no]]} />
            {answers.owned_jan1 === "no" && <Field id="moved_in" label={ELIGIBILITY.q1when}><input id="moved_in" className="input" type="month" name="moved_in" value={answers.moved_in ?? ""} onChange={(e) => setAnswers({ ...answers, moved_in: e.target.value })} /></Field>}
            <ChoiceGroup name="primary" label={ELIGIBILITY.q2} value={answers.primary} onChange={(v) => setAnswers({ ...answers, primary: v })} options={[["yes", ELIGIBILITY.yes], ["no", ELIGIBILITY.no]]} />
            <ChoiceGroup name="other_hs" label={ELIGIBILITY.q3} value={answers.other_hs} onChange={(v) => setAnswers({ ...answers, other_hs: v })} options={[["no", ELIGIBILITY.no], ["yes", ELIGIBILITY.yes]]} />
            <ChoiceGroup name="prev_homestead" label={ELIGIBILITY.q4} value={answers.prev_homestead} onChange={(v) => setAnswers({ ...answers, prev_homestead: v })} options={[["no", ELIGIBILITY.no], ["yes", ELIGIBILITY.q4yes]]} />
            {answers.prev_homestead === "yes" && <Field id="prev_homestead_address" label={ELIGIBILITY.q4where}><input id="prev_homestead_address" className="input" type="text" name="prev_homestead_address" placeholder="Street, city, state" value={answers.prev_homestead_address ?? ""} onChange={(e) => setAnswers({ ...answers, prev_homestead_address: e.target.value })} /></Field>}
            <ChoiceGroup name="household" label={ELIGIBILITY.q5} value={answers.household} onChange={(v) => setAnswers({ ...answers, household: v })} options={Object.entries(ELIGIBILITY.q5opts) as Array<[string, string]>} stack />
            <p className="fine">{ELIGIBILITY.note}</p>
          </section>
        ), <button className="btn btn-l btn-block" data-testid="btn-continue" disabled={!eligibilityComplete} onClick={() => go("license")}>{FLOW.continueCta}</button>, "estimate")}

        {phase === "license" && chrome(LICENSE.title, (
          <section className="flex flex-col gap-5">
            <p className="text-body">{LICENSE.intro(situs)}</p>
            <div className="flex flex-col gap-3">
              <div className="flow-q">{LICENSE.precheckTitle}</div>
              <p className="fine -mt-2">{LICENSE.precheckHelp}</p>
              <Field id="typed_name" label={LICENSE.nameLabel}><input id="typed_name" name="typed_name" className="input" autoComplete="name" value={typed.name} onChange={(e) => setTyped({ ...typed, name: e.target.value })} /></Field>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Field id="typed_address" label={LICENSE.addressLabel}><input id="typed_address" name="typed_address" className="input" autoComplete="street-address" value={typed.address} onChange={(e) => typedChange({ ...typed, address: e.target.value })} onBlur={() => runPrecheck()} /></Field>
                <Field id="typed_zip" label={LICENSE.zipLabel}><input id="typed_zip" name="typed_zip" className="input" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={typed.zip} onChange={(e) => typedChange({ ...typed, zip: e.target.value })} onBlur={() => runPrecheck()} /></Field>
              </div>
              <div className="min-h-6 text-[14px]" aria-live="polite" data-testid="precheck-result">
                {preBusy && <span className="fine">Checking…</span>}
                {!preBusy && pre && (pre.match ? <span className="font-semibold" style={{ color: "var(--success)" }}><span className="dot-ok" aria-hidden="true" />{LICENSE.precheckMatch}</span> : <span className="font-semibold" style={{ color: "var(--error)" }}>{LICENSE.precheckMismatch}</span>)}
              </div>
            </div>
            <label className={`upload relative ${front ? "upload-done" : ""}`} htmlFor="dl_front">
              <input id="dl_front" name="dl_front" type="file" accept="image/*,application/pdf,.heic,.heif" capture="environment" required onChange={(e) => pickFile(e.target.files?.[0] ?? null, "front")} />
              <span className="font-semibold text-ink">{front ? LICENSE.chosen(front.name) : LICENSE.front}</span>
              <span className="fine">{front ? LICENSE.retake : LICENSE.cameraHint}</span>
            </label>
            <label className={`upload upload-slim relative ${back ? "upload-done" : ""}`} htmlFor="dl_back">
              <input id="dl_back" name="dl_back" type="file" accept="image/*,application/pdf,.heic,.heif" capture="environment" onChange={(e) => pickFile(e.target.files?.[0] ?? null, "back")} />
              <span className="text-[14px] text-body">{back ? LICENSE.chosen(back.name) : LICENSE.back}</span>
            </label>
            {converting && <p className="fine" aria-live="polite">{LICENSE.converting}</p>}
            <p className="fine">{LICENSE.privacy}</p>
            <div className="card card-tint card-sm"><p className="text-[14px] text-body"><b className="text-ink">{LICENSE.mismatchCallout.split("?")[0]}?</b>{LICENSE.mismatchCallout.split("?").slice(1).join("?")}</p></div>
            <ErrorBanner errors={errors} />
          </section>
        ), <button className="btn btn-l btn-block" data-testid="btn-continue" disabled={!front || converting} onClick={() => { if (!contact.full_name && typed.name) setContact({ ...contact, full_name: typed.name }); go("contact"); }}>{FLOW.continueCta}</button>, "eligibility")}

        {phase === "contact" && chrome(CONTACT.title, (
          <section className="flex flex-col gap-4">
            <Field id="full_name" label={CONTACT.name}><input id="full_name" name="full_name" className="input" autoComplete="name" required placeholder={CONTACT.namePlaceholder} value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} /></Field>
            <Field id="email" label={CONTACT.email}><input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required placeholder={CONTACT.emailPlaceholder} value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field>
            <Field id="phone" label={CONTACT.phone}><input id="phone" name="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" placeholder={CONTACT.phonePlaceholder} value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field>
            <p className="fine">{CONTACT.note}</p>
          </section>
        ), <button className="btn btn-l btn-block" data-testid="btn-continue" disabled={!contact.full_name || !EMAIL_RE.test(contact.email)} onClick={() => go("sign")}>{FLOW.continueCta}</button>, "license")}

        {(phase === "sign" || phase === "submitting") && chrome(SIGN.title, (
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl p-4 text-[14px] text-body" style={{ background: "var(--row-tint)" }}>
              <p><b className="text-ink">{SIGN.whatWeDo}</b> {SIGN.whatWeDoBody}</p>
              <p className="mt-3"><b className="text-ink">{SIGN.whatYouPay}</b> <b className="text-ink">{SIGN.whatYouPayBody1}</b> {SIGN.whatYouPayBody2} <b className="text-ink">{SIGN.whatYouPayBody3}</b> {SIGN.whatYouPayBody4}</p>
              <p className="fine mt-3"><b>{SIGN.disclosure}</b> {SIGN.disclosureBody}</p>
            </div>
            <Checkbox id="agree_terms" checked={consents.agree_terms} onChange={(v) => setConsents({ ...consents, agree_terms: v })}>{SIGN.agreeTerms1}<a href={`/agreement/${code}`} target="_blank" rel="noopener" className="font-semibold">{SIGN.agreeTermsLink}</a>{SIGN.agreeTerms2}</Checkbox>
            <Checkbox id="agree_esign" checked={consents.agree_esign} onChange={(v) => setConsents({ ...consents, agree_esign: v })}>{SIGN.agreeEsign}</Checkbox>
            <Checkbox id="agree_free" checked={consents.agree_free} onChange={(v) => setConsents({ ...consents, agree_free: v })}>{SIGN.agreeFree}</Checkbox>
            <Field id="signature_name" label={SIGN.sigLabel}><input id="signature_name" name="signature_name" className="input input-sig" autoComplete="off" placeholder={SIGN.sigPlaceholder} value={signature} onChange={(e) => setSignature(e.target.value)} /></Field>
            <p className="fine">{SIGN.record}</p>
            <ErrorBanner errors={errors} testId="errors" />
          </section>
        ), <button className="btn btn-l btn-block" data-testid="btn-submit" disabled={phase === "submitting" || !signReady} onClick={submit}>{phase === "submitting" ? SIGN.sending : SIGN.submit}</button>, "contact")}

        {phase === "result" && !result && (
          <section aria-live="polite" data-testid="checking" className="flex flex-col gap-4">
            <Progress done={5} total={5} thin />
            <h1 className="flow-title">{RESULT.checking}</h1>
            <p className="text-body">{RESULT.checkingSub}</p>
            <div className="skeleton" style={{ height: 120 }} />
            {timedOut && (<div className="card card-tint card-sm"><p className="text-[14px] text-body">{RESULT.timeout}</p><Link className="btn btn-outline self-start" href={`/claim/${code}/status`}>{RESULT.status}</Link></div>)}
          </section>
        )}

        {phase === "result" && result && claimId && (
          <ResultView code={code} claimId={claimId} claim={result} situs={situs} onReprocess={reprocess} onContinue={() => go(STRIPE_ENABLED ? "card" : "done")} />
        )}

        {phase === "fix" && claimId && (
          <FixScreen code={code} claimId={claimId} situs={situs} findings={(result ?? closed?.claim)?.findings ?? []} onReuploaded={() => reprocess()} />
        )}

        {phase === "card" && claimId && <CardStep code={code} claimId={claimId} onDone={() => go("done")} />}
        {phase === "done" && <DoneScreen code={code} firstName={firstName} />}
      </div>
    </div>
  );
}
