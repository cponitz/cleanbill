"use client";
// The public site's address / business forms (SPEC-07 §01, §06, §07, §08). There is no address→estimate lookup API
// (ADR 0018): each form takes the address (or company) plus an e-mail and posts `POST /claim/inquiry`; we answer by
// e-mail. The home hero's card also takes a claim code, which opens /claim/[code] directly — the only instant path.
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CODE_PLACEHOLDER, type InquiryKind, maskCode, normalizeCode, postInquiry } from "@/lib/api";
import { CODE_PAGE } from "@/lib/copy";
import { APPEALS, BUSINESSES, EXEMPTIONS, HOME, INQUIRY } from "@/lib/site";
import { Field } from "./ui";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
type State = "idle" | "email" | "busy" | "done" | "error";

/** Shared submit for the homeowner kinds: address first, then the e-mail step, then the confirmation. */
function useAddressInquiry(kind: InquiryKind) {
  const path = usePathname() ?? "/";
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    if (!address.trim()) { setError(INQUIRY.errorAddress); return; }
    setError(null); setState("email");
  };
  const send = async () => {
    if (!EMAIL_RE.test(email)) { setError(INQUIRY.errorEmail); return; }
    setError(null); setState("busy");
    const r = await postInquiry({ kind, address: address.trim(), email: email.trim(), source_path: path }).catch(() => null);
    if (r && r.ok) { setState("done"); return; }
    setError(r && r.error === "rate_limited" ? INQUIRY.errorRate : INQUIRY.errorNetwork); setState("email");
  };
  return { address, setAddress, email, setEmail, state, error, start, send };
}

function EmailStep({ q, cta = INQUIRY.send, id }: { q: ReturnType<typeof useAddressInquiry>; cta?: string; id: string }) {
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); q.send(); }} data-testid="inquiry-email">
      <div className="fine">{q.address}</div>
      <Field id={id} label={INQUIRY.emailLabel} error={q.error}>
        <input id={id} className="input" type="email" inputMode="email" autoComplete="email" placeholder={INQUIRY.emailPlaceholder} value={q.email} onChange={(e) => q.setEmail(e.target.value)} autoFocus aria-invalid={!!q.error} />
      </Field>
      <button type="submit" className="btn btn-l btn-block" disabled={q.state === "busy"}>{q.state === "busy" ? INQUIRY.sending : cta}</button>
      <p className="fine text-center">{INQUIRY.fine}</p>
    </form>
  );
}

function Done({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2" role="status" data-testid="inquiry-done">
      <div className="h3">{INQUIRY.doneTitle}</div>
      <p className="text-body">{text}</p>
    </div>
  );
}

/** Home hero card: "Start with either" — address (→ inquiry) or claim code (→ /claim/[code]). Either field enables the CTA. */
export function StartForm() {
  const router = useRouter();
  const q = useAddressInquiry("address");
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const canGo = !!(q.address.trim() || code.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      const c = normalizeCode(code);
      if (!c) { setCodeErr(CODE_PAGE.notFound); return; }
      router.push(`/claim/${c}`);
      return;
    }
    q.start();
  };

  return (
    <div className="card card-elevated" id="start" data-testid="start-card">
      {q.state === "done" ? <Done text={INQUIRY.doneBody(q.address)} /> : q.state === "email" || q.state === "busy" ? (
        <>
          <div className="h3">{HOME.card.title}</div>
          <EmailStep q={q} id="start_email" cta={HOME.card.cta} />
        </>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <div className="h3">{HOME.card.title}</div>
          <Field id="address" label={HOME.card.address} error={q.error}>
            <input id="address" name="address" className="input" autoComplete="street-address" placeholder={HOME.card.addressPlaceholder} value={q.address} onChange={(e) => q.setAddress(e.target.value)} aria-invalid={!!q.error} />
          </Field>
          <div className="flex items-center gap-3 fine"><span className="h-px flex-1 bg-hairline" /> {HOME.card.or} <span className="h-px flex-1 bg-hairline" /></div>
          <Field id="code" label={HOME.card.code} error={codeErr}>
            <input id="code" name="c" className="input input-mono" placeholder={CODE_PLACEHOLDER} autoComplete="off" autoCapitalize="characters" spellCheck={false} value={code} onChange={(e) => { setCode(maskCode(e.target.value)); setCodeErr(null); }} aria-invalid={!!codeErr} aria-describedby={codeErr ? "code-err" : undefined} />
          </Field>
          <button type="submit" className="btn btn-l btn-block" disabled={!canGo}>{HOME.card.cta}</button>
          <p className="fine text-center">{HOME.card.fine}</p>
        </form>
      )}
    </div>
  );
}

/** Exemptions page: the search pill. */
export function AddressPill() {
  const q = useAddressInquiry("exemption");
  if (q.state === "done") return <div className="card card-tint"><Done text={INQUIRY.doneBody(q.address)} /></div>;
  if (q.state === "email" || q.state === "busy") return <div className="card card-elevated"><EmailStep q={q} id="exemption_email" /></div>;
  return (
    <form onSubmit={(e) => { e.preventDefault(); q.start(); }} className="flex flex-col gap-2">
      <label className="search-pill" htmlFor="exemption_address">
        <span className="sr-only">{INQUIRY.addressLabel}</span>
        <input id="exemption_address" autoComplete="street-address" placeholder={EXEMPTIONS.searchPlaceholder} value={q.address} onChange={(e) => q.setAddress(e.target.value)} aria-invalid={!!q.error} />
        <button type="submit" className="btn">{EXEMPTIONS.search}</button>
      </label>
      {q.error && <div className="field-error" role="alert">{q.error}</div>}
    </form>
  );
}

/** Appeals page: the elevated "Check your appraisal" card. */
export function AppealCard() {
  const q = useAddressInquiry("appeal");
  return (
    <div className="card card-elevated" data-testid="appeal-card">
      {q.state === "done" ? <Done text={INQUIRY.doneBody(q.address)} /> : q.state === "email" || q.state === "busy" ? (
        <><div className="h3">{APPEALS.card.title}</div><EmailStep q={q} id="appeal_email" cta={APPEALS.card.cta} /></>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); q.start(); }}>
          <div className="h3">{APPEALS.card.title}</div>
          <Field id="appeal_address" label={INQUIRY.addressLabel} error={q.error}>
            <input id="appeal_address" className="input" autoComplete="street-address" placeholder={APPEALS.card.placeholder} value={q.address} onChange={(e) => q.setAddress(e.target.value)} aria-invalid={!!q.error} />
          </Field>
          <button type="submit" className="btn btn-l btn-block">{APPEALS.card.cta}</button>
          <p className="fine text-center">{APPEALS.card.fine}</p>
        </form>
      )}
    </div>
  );
}

/** Businesses page: company · work e-mail · number of properties · bill-type multi-select → POST /claim/inquiry {kind: business}. */
export function BusinessForm() {
  const path = usePathname() ?? "/businesses";
  const [v, setV] = useState({ company: "", email: "", properties: "" });
  const [bills, setBills] = useState<string[]>([]);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<{ company?: string; email?: string; form?: string }>({});

  const toggle = (k: string) => setBills((b) => b.includes(k) ? b.filter((x) => x !== k) : [...b, k]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof error = {};
    if (!v.company.trim()) errs.company = INQUIRY.errorCompany;
    if (!EMAIL_RE.test(v.email)) errs.email = INQUIRY.errorEmail;
    setError(errs);
    if (Object.keys(errs).length) return;
    setState("busy");
    const r = await postInquiry({ kind: "business", company: v.company.trim(), email: v.email.trim(), properties: v.properties ? Number(v.properties) : undefined, bills, source_path: path }).catch(() => null);
    if (r && r.ok) { setState("done"); return; }
    setError({ form: r && r.error === "rate_limited" ? INQUIRY.errorRate : INQUIRY.errorNetwork }); setState("idle");
  };

  if (state === "done") return <div className="card card-elevated" data-testid="business-card"><Done text={INQUIRY.doneBusiness} /></div>;
  return (
    <form className="card card-elevated" onSubmit={submit} data-testid="business-card" noValidate>
      <div className="h3">{BUSINESSES.form.title}</div>
      <Field id="company" label={BUSINESSES.form.company} error={error.company}>
        <input id="company" className="input" autoComplete="organization" placeholder={BUSINESSES.form.company} value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} aria-invalid={!!error.company} />
      </Field>
      <Field id="work_email" label={BUSINESSES.form.email} error={error.email}>
        <input id="work_email" className="input" type="email" inputMode="email" autoComplete="email" placeholder={BUSINESSES.form.email} value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} aria-invalid={!!error.email} />
      </Field>
      <Field id="properties" label={BUSINESSES.form.properties}>
        <input id="properties" className="input" inputMode="numeric" pattern="[0-9]*" placeholder={BUSINESSES.form.properties} value={v.properties} onChange={(e) => setV({ ...v, properties: e.target.value.replace(/\D/g, "").slice(0, 5) })} />
      </Field>
      <fieldset className="m-0 border-0 p-0">
        <legend className="label">{BUSINESSES.form.bills}</legend>
        <div className="flex flex-wrap gap-2">
          {BUSINESSES.bills.map(([k, t]) => (
            <label key={k} className={`choice ${bills.includes(k) ? "" : ""}`} style={{ flex: "0 0 auto", padding: "8px 14px" }}>
              <input type="checkbox" name="bills" value={k} checked={bills.includes(k)} onChange={() => toggle(k)} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      {error.form && <div className="banner-error" role="alert">{error.form}</div>}
      <button type="submit" className="btn btn-l btn-block" disabled={state === "busy"}>{state === "busy" ? INQUIRY.sending : BUSINESSES.form.cta}</button>
      <p className="fine text-center">{INQUIRY.fine}</p>
    </form>
  );
}
