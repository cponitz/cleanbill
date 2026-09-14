"use client";
// The claim flow (SPEC-04b §2, SPEC-06b, SPEC-02 §1/§6): estimate → eligibility → typed pre-check + license photo → contact →
// review & sign → inline result (poll) → card (flag) → done. A code whose lead is already claimed opens straight into the
// fix screen (needs_dl_update), the result (submitted/processing/needs_review/ready) or the status summary.
// Every string comes from lib/copy.ts; every network call from lib/api.ts.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type ClaimLookup, type ClaimSummary, type ClosedInfo, getClaim, type LeadInfo, postEvent, precheck, STRIPE_ENABLED, submitClaim, waitForResult,
} from "@/lib/api";
import { CONTACT, ELIGIBILITY, ERRORS, ESTIMATE, LICENSE, RESULT, SIGN, STATUS, TCAD_URL } from "@/lib/copy";
import { byYear, moneyFloor } from "@/lib/format";
import { toJpegIfHeic } from "@/lib/heic";
import { FixScreen } from "./FixScreen";
import { CardStep, DoneScreen, ResultView } from "./ClaimResult";

type Phase = "loading" | "notfound" | "offline" | "ratelimited" | "estimate" | "eligibility" | "license" | "contact" | "sign" | "submitting" | "result" | "fix" | "card" | "done" | "closed";

const MAX_BYTES = 15 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function ClaimFlow({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<LeadInfo | null>(null);
  const [closed, setClosed] = useState<ClosedInfo | null>(null);
  const [claimId, setClaimId] = useState<string | null>(null);
  const [result, setResult] = useState<ClaimSummary | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // form state
  const [answers, setAnswers] = useState<Record<string, string>>({ household: "single" });
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

  const situs = info?.property.situs_full ?? closed?.property.situs_full ?? "";
  const years = (info?.lead.refund_years ?? closed?.lead.refund_years ?? []).slice().sort();
  const earliest = info?.earliest_year ?? years[0] ?? new Date().getFullYear() - 2;

  const routeClosed = useCallback((j: ClosedInfo) => {
    setClosed(j);
    const c = j.claim;
    if (!c) { setPhase("closed"); return; }
    setClaimId(c.id);
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

  const go = (p: Phase) => { setErrors([]); setPhase(p); topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const runPrecheck = async () => {
    if (!typed.address.trim()) { setPre(null); return; }
    setPreBusy(true);
    const r = await precheck(code, typed.address, typed.zip).catch(() => null);
    setPreBusy(false);
    setPre(r && r.ok ? { match: r.match } : null);
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
    setClaimId(j.claim_id); setResult(null); setTimedOut(false); go("result");
  };

  // after a re-upload / typed confirmation the API set the claim to `processing`: poll again
  const reprocess = (newClaimId?: string) => { if (newClaimId) setClaimId(newClaimId); setResult(null); setTimedOut(false); go("result"); };

  return (
    <div ref={topRef}>
      {phase === "loading" && <p className="note" aria-live="polite">Loading your claim…</p>}
      {phase === "notfound" && (<div><h1>{ERRORS.notFound}</h1><p>{ERRORS.notFoundHelp}</p></div>)}
      {phase === "ratelimited" && (<div><h1>{ERRORS.rateLimited}</h1></div>)}
      {phase === "offline" && (<div><h1>{ERRORS.offline}</h1><button className="btn mt-3" onClick={() => location.reload()}>Try again</button></div>)}

      {phase === "closed" && closed && (
        <div data-testid="closed">
          <h1>{situs}</h1>
          <p>{(STATUS[closed.status] ?? STATUS.none).title}</p>
          <p className="note">{(STATUS[closed.status] ?? STATUS.none).body}</p>
          <a className="btn btn-secondary mt-3" href={`/claim/${code}/status`}>Claim status</a>
        </div>
      )}

      {phase === "estimate" && info && (
        <section data-testid="estimate">
          <h1>{info.property.situs_full}</h1>
          <p className="note">{ESTIMATE.account(info.property.prop_id, info.property.owner_name)}</p>
          <div className="card mt-3">
            <div className="note">{ESTIMATE.refundLabel}</div>
            <div className="text-[34px] font-bold leading-tight text-navy" data-testid="refund">{moneyFloor(info.lead.est_refund_total)}</div>
            <ul className="mt-2 list-none space-y-1 p-0">
              {byYear(info.lead.est_refund_by_year).map(([y, t]) => <li key={y}>• {ESTIMATE.yearLine(y, moneyFloor(t))}</li>)}
            </ul>
            <p className="mt-3 font-semibold">{ESTIMATE.forward(moneyFloor(info.lead.est_forward_annual))} <span className="font-normal">{ESTIMATE.forwardNote}</span></p>
            <p className="note"><b>Timing:</b> {ESTIMATE.timing(earliest, info.deadline).replace(/^Timing: /, "")}</p>
            <p className="note mb-0">{ESTIMATE.disclaimer}</p>
          </div>
          <div className="callout mt-4">
            <b>{ESTIMATE.free}</b> at <a href={TCAD_URL} target="_blank" rel="noopener">traviscad.org</a> {ESTIMATE.freeTail}
          </div>
          <button className="btn mt-4" data-testid="btn-continue" onClick={() => go("eligibility")}>{ESTIMATE.cta}</button>
        </section>
      )}

      {phase === "eligibility" && (
        <section>
          <h1>{ELIGIBILITY.title}</h1>
          <Radio name="owned_jan1" label={ELIGIBILITY.q1(earliest)} value={answers.owned_jan1} onChange={(v) => setAnswers({ ...answers, owned_jan1: v })}
            options={[["yes", ELIGIBILITY.yes], ["no", ELIGIBILITY.q1no]]} />
          {answers.owned_jan1 === "no" && <input className="input mt-2" type="month" name="moved_in" aria-label="Month you moved in" value={answers.moved_in ?? ""} onChange={(e) => setAnswers({ ...answers, moved_in: e.target.value })} />}
          <Radio name="primary" label={ELIGIBILITY.q2} value={answers.primary} onChange={(v) => setAnswers({ ...answers, primary: v })} options={[["yes", ELIGIBILITY.yes], ["no", ELIGIBILITY.no]]} />
          <Radio name="other_hs" label={ELIGIBILITY.q3} value={answers.other_hs} onChange={(v) => setAnswers({ ...answers, other_hs: v })} options={[["no", ELIGIBILITY.no], ["yes", ELIGIBILITY.yes]]} />
          <Radio name="prev_homestead" label={ELIGIBILITY.q4} value={answers.prev_homestead} onChange={(v) => setAnswers({ ...answers, prev_homestead: v })} options={[["no", ELIGIBILITY.no], ["yes", ELIGIBILITY.q4yes]]} />
          {answers.prev_homestead === "yes" && <input className="input mt-2" type="text" name="prev_homestead_address" placeholder="street, city, state" aria-label="Previous address" value={answers.prev_homestead_address ?? ""} onChange={(e) => setAnswers({ ...answers, prev_homestead_address: e.target.value })} />}
          <Radio name="household" label={ELIGIBILITY.q5} value={answers.household} onChange={(v) => setAnswers({ ...answers, household: v })}
            options={Object.entries(ELIGIBILITY.q5opts) as Array<[string, string]>} />
          <p className="note">{ELIGIBILITY.note}</p>
          <button className="btn mt-4" data-testid="btn-continue" disabled={!eligibilityComplete} onClick={() => go("license")}>{RESULT.continue}</button>
        </section>
      )}

      {phase === "license" && (
        <section>
          <h1>{LICENSE.title}</h1>
          <p>{LICENSE.intro(situs)}</p>
          <div className="card mt-3">
            <div className="font-semibold">{LICENSE.precheckTitle}</div>
            <p className="note mt-1">{LICENSE.precheckHelp}</p>
            <label className="mt-2 block text-[14px] font-semibold" htmlFor="typed_name">{LICENSE.nameLabel}</label>
            <input id="typed_name" name="typed_name" className="input" autoComplete="name" value={typed.name} onChange={(e) => setTyped({ ...typed, name: e.target.value })} />
            <label className="mt-2 block text-[14px] font-semibold" htmlFor="typed_address">{LICENSE.addressLabel}</label>
            <input id="typed_address" name="typed_address" className="input" autoComplete="street-address" value={typed.address} onChange={(e) => setTyped({ ...typed, address: e.target.value })} onBlur={runPrecheck} />
            <label className="mt-2 block text-[14px] font-semibold" htmlFor="typed_zip">{LICENSE.zipLabel}</label>
            <input id="typed_zip" name="typed_zip" className="input" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={typed.zip} onChange={(e) => setTyped({ ...typed, zip: e.target.value })} onBlur={runPrecheck} />
            <div className="mt-2 min-h-6" aria-live="polite" data-testid="precheck-result">
              {preBusy && <span className="note">Checking…</span>}
              {!preBusy && pre && (pre.match ? <span className="ok font-semibold">✓ {LICENSE.precheckMatch}</span> : <span className="bad">{LICENSE.precheckMismatch}</span>)}
            </div>
          </div>
          <div className="file mt-4">
            <label htmlFor="dl_front" className="font-semibold">📷 {LICENSE.front}</label>
            <input id="dl_front" name="dl_front" type="file" accept="image/*,application/pdf,.heic,.heif" capture="environment" required onChange={(e) => pickFile(e.target.files?.[0] ?? null, "front")} />
            {front && <div className="note mt-1">✓ {front.name}</div>}
          </div>
          <div className="file mt-2">
            <label htmlFor="dl_back">{LICENSE.back}</label>
            <input id="dl_back" name="dl_back" type="file" accept="image/*,application/pdf,.heic,.heif" capture="environment" onChange={(e) => pickFile(e.target.files?.[0] ?? null, "back")} />
          </div>
          {converting && <p className="note" aria-live="polite">{LICENSE.converting}</p>}
          <p className="note mt-2">{LICENSE.cameraHint}</p>
          <p className="note">{LICENSE.privacy}</p>
          <div className="callout"><b>{LICENSE.mismatchCallout.split("?")[0]}?</b>{LICENSE.mismatchCallout.split("?").slice(1).join("?")}</div>
          {errors.length > 0 && <div className="err mt-3" role="alert">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
          <button className="btn mt-4" data-testid="btn-continue" disabled={!front || converting} onClick={() => { if (!contact.full_name && typed.name) setContact({ ...contact, full_name: typed.name }); go("contact"); }}>{RESULT.continue}</button>
        </section>
      )}

      {phase === "contact" && (
        <section>
          <h1>{CONTACT.title}</h1>
          <label className="mt-3 block font-semibold" htmlFor="full_name">{CONTACT.name}</label>
          <input id="full_name" name="full_name" className="input" autoComplete="name" required value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} />
          <label className="mt-3 block font-semibold" htmlFor="email">{CONTACT.email}</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" inputMode="email" required value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          <label className="mt-3 block font-semibold" htmlFor="phone">{CONTACT.phone}</label>
          <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          <button className="btn mt-4" data-testid="btn-continue" disabled={!contact.full_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.email)} onClick={() => go("sign")}>{RESULT.continue}</button>
        </section>
      )}

      {(phase === "sign" || phase === "submitting") && (
        <section>
          <h1>{SIGN.title}</h1>
          <div className="card">
            <p className="mt-0"><b>{SIGN.whatWeDo}</b> {SIGN.whatWeDoBody}</p>
            <p><b>{SIGN.whatYouPay}</b> <b>{SIGN.whatYouPayBody1}</b> {SIGN.whatYouPayBody2} <b>{SIGN.whatYouPayBody3}</b> {SIGN.whatYouPayBody4}</p>
            <p className="note mb-0"><b>{SIGN.disclosure}</b> {SIGN.disclosureBody}</p>
          </div>
          <div className="chk"><input id="agree_terms" name="agree_terms" type="checkbox" checked={consents.agree_terms} onChange={(e) => setConsents({ ...consents, agree_terms: e.target.checked })} /><label htmlFor="agree_terms">{SIGN.agreeTerms1}<a href={`/agreement/${code}`} target="_blank" rel="noopener">{SIGN.agreeTermsLink}</a>{SIGN.agreeTerms2}</label></div>
          <div className="chk"><input id="agree_esign" name="agree_esign" type="checkbox" checked={consents.agree_esign} onChange={(e) => setConsents({ ...consents, agree_esign: e.target.checked })} /><label htmlFor="agree_esign">{SIGN.agreeEsign}</label></div>
          <div className="chk"><input id="agree_free" name="agree_free" type="checkbox" checked={consents.agree_free} onChange={(e) => setConsents({ ...consents, agree_free: e.target.checked })} /><label htmlFor="agree_free">{SIGN.agreeFree}</label></div>
          <label className="mt-3 block font-semibold" htmlFor="signature_name">{SIGN.sigLabel}</label>
          <input id="signature_name" name="signature_name" className="input italic" autoComplete="off" placeholder="Your full name" value={signature} onChange={(e) => setSignature(e.target.value)} />
          <p className="note">{SIGN.record}</p>
          {errors.length > 0 && <div className="err mt-3" role="alert" data-testid="errors">{errors.map((e) => <div key={e}>{e}</div>)}</div>}
          <button className="btn mt-4" data-testid="btn-submit" disabled={phase === "submitting"} onClick={submit}>{phase === "submitting" ? "Sending…" : SIGN.submit}</button>
        </section>
      )}

      {phase === "result" && !result && (
        <section aria-live="polite" data-testid="checking">
          <h1>{RESULT.checking}</h1>
          <p className="note">{RESULT.checkingSub}</p>
          {timedOut && (<div className="callout mt-3"><p className="mt-0">{RESULT.timeout}</p><a className="btn btn-secondary" href={`/claim/${code}/status`}>Claim status</a></div>)}
        </section>
      )}

      {phase === "result" && result && claimId && (
        <ResultView code={code} claimId={claimId} claim={result} situs={situs}
          onReprocess={reprocess}
          onContinue={() => go(STRIPE_ENABLED ? "card" : "done")} />
      )}

      {phase === "fix" && claimId && (
        <FixScreen code={code} claimId={claimId} situs={situs} findings={(result ?? closed?.claim)?.findings ?? []} onReuploaded={() => reprocess()} />
      )}

      {phase === "card" && claimId && <CardStep code={code} claimId={claimId} onDone={() => go("done")} />}
      {phase === "done" && <DoneScreen code={code} />}
    </div>
  );
}

function Radio({ name, label, value, onChange, options }: { name: string; label: string; value?: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <fieldset className="radio mt-4 border-0 p-0">
      <legend className="font-semibold">{label}</legend>
      {options.map(([v, text]) => (
        <label key={v}><input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} /> {text}</label>
      ))}
    </fieldset>
  );
}
