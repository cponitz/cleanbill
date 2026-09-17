// Small shared parts of the SPEC-07 component sheet: logo, photo slot, progress row, status pill, choice group, field.
import Link from "next/link";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/copy";
import { PILL, type PillTone } from "@/lib/status";
import { MARK_PATH, MARK_STROKE } from "@/styles/brand.generated";

/** The mark (SPEC-08 Part C): a receipt outline with a check, stroked in currentColor. Same geometry as trd/brand.py. */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d={MARK_PATH} fill="none" stroke="currentColor" strokeWidth={MARK_STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label={`${BRAND} home`}>
      <span className="logo-mark"><Mark /></span>
      <span>{BRAND}</span>
    </Link>
  );
}

const BADGE: Record<PillTone, string> = { neutral: "badge-neutral", teal: "badge-teal", sand: "badge-sand", ok: "badge-ok", bad: "badge-bad", off: "badge-off" };

/** Status badge for dense tables (SPEC-09): the same map as StatusPill at table scale. */
export function StatusBadge({ status }: { status: string }) {
  const p = PILL[status] ?? { label: status, tone: "neutral" as PillTone };
  return <span className={`badge ${BADGE[p.tone]}`} data-status={status}>{p.label}</span>;
}

export function PhotoSlot({ label, className = "", style }: { label: string; className?: string; style?: React.CSSProperties }) {
  return <div className={`photo ${className}`} style={style} role="img" aria-label="Image placeholder">{label}</div>;
}

/** `total` equal segments, the first `done` filled (6 × 6px on the portal, 5 × 3px in the signup flow). */
export function Progress({ done, total, thin = false, label }: { done: number; total: number; thin?: boolean; label?: string }) {
  return (
    <div className={`progress ${thin ? "progress-thin" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={label}>
      {Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? "done" : ""} />)}
    </div>
  );
}

const TONE: Record<PillTone, string> = { neutral: "pill-neutral", teal: "pill-teal", sand: "pill-sand", ok: "pill-ok", bad: "pill-bad", off: "pill-off" };

export function StatusPill({ status, small = false }: { status: string; small?: boolean }) {
  const p = PILL[status] ?? { label: status, tone: "neutral" as PillTone };
  return <span className={`pill ${TONE[p.tone]} ${small ? "pill-sm" : ""}`} data-status={status}>{p.label}</span>;
}

export function Pill({ tone = "teal", children, small = false }: { tone?: PillTone; children: ReactNode; small?: boolean }) {
  return <span className={`pill ${TONE[tone]} ${small ? "pill-sm" : ""}`}>{children}</span>;
}

/** Choice buttons (SPEC-07 signup): a fieldset of radios styled as buttons; the radio keeps the form semantics. */
export function ChoiceGroup({ name, label, value, onChange, options, stack = false }: {
  name: string; label: string; value?: string; onChange: (v: string) => void; options: Array<[string, string]>; stack?: boolean;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="flow-q mb-2">{label}</legend>
      <div className={`choices ${stack ? "choices-stack" : ""}`}>
        {options.map(([v, text]) => (
          <label key={v} className="choice">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Field({ id, label, children, error, hint }: { id: string; label: string; children: ReactNode; error?: string | null; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="fine mt-1.5">{hint}</div> : null}
    </div>
  );
}

export function Checkbox({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="chk" htmlFor={id}>
      <input id={id} name={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function ErrorBanner({ errors, testId }: { errors: string[]; testId?: string }) {
  if (!errors.length) return null;
  return <div className="banner-error" role="alert" data-testid={testId}>{errors.map((e) => <div key={e}>{e}</div>)}</div>;
}
