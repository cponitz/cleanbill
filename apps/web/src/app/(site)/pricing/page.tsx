import type { Metadata } from "next";
import { PRICING } from "@/lib/site";

export const metadata: Metadata = { title: "Pricing" };

// Pricing (SPEC-07 §03): worked-example ledger, four side cards, the compare table (stacked rows on mobile).
export default function PricingPage() {
  return (
    <div className="wrap section flex flex-col gap-14">
      <header className="flex flex-col gap-4">
        <h1 className="h1">{PRICING.h1}</h1>
        <p className="lead" style={{ maxWidth: 720 }}>{PRICING.lead}</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card" style={{ padding: 32, gap: 8 }}>
          <div className="eyebrow eyebrow-sm muted" style={{ color: "var(--color-muted)" }}>{PRICING.exampleEyebrow}</div>
          <div className="ledger">
            {PRICING.example.map((r) => (
              <div key={r.label} className={`ledger-row ${r.keep ? "!text-[20px]" : ""}`} style={r.teal ? { color: "var(--color-primary)" } : r.muted ? { color: "var(--color-muted)" } : undefined}>
                {r.bold || r.keep ? <b>{r.label}</b> : <span>{r.label}</span>}
                {r.bold || r.keep ? <b>{r.value}</b> : <span className="font-semibold" style={r.teal ? { color: "var(--color-primary)" } : undefined}>{r.value}</span>}
              </div>
            ))}
          </div>
          <p className="fine">{PRICING.exampleNote}</p>
        </div>
        <div className="flex flex-col gap-4">
          {PRICING.cards.map(([t, b]) => (
            <div key={t} className="card card-sm" style={{ padding: 22, gap: 6 }}><div className="h3" style={{ fontSize: 17 }}>{t}</div><p className="text-body">{b}</p></div>
          ))}
          <div className="card card-sm card-tint" style={{ padding: 22, gap: 6 }}><div className="h3" style={{ fontSize: 17, color: "var(--color-primary-strong)" }}>{PRICING.free[0]}</div><p className="text-body">{PRICING.free[1]}</p></div>
        </div>
      </div>

      <section className="flex flex-col gap-6">
        <h2 className="h2">{PRICING.compareTitle}</h2>
        <div className="compare max-md:hidden">
          <div className="th" />
          {PRICING.compareHead.map((h, i) => <div key={h} className={`th ${i === 2 ? "th-us" : ""}`}>{h}</div>)}
          {PRICING.compare.map((row) => row.map((cell, i) => <div key={row[0] + i} className={i === 3 ? "us" : ""}>{cell}</div>))}
        </div>
        <div className="flex flex-col gap-3 md:hidden">
          {PRICING.compare.map((row) => (
            <div key={row[0]} className="card card-sm" style={{ gap: 8 }}>
              <div className="font-semibold text-ink">{row[0]}</div>
              <div className="grid grid-cols-3 gap-2 text-[14px] text-body">
                {row.slice(1).map((c, i) => <div key={i}><div className="fine">{PRICING.compareHead[i]}</div><div className={i === 2 ? "font-semibold text-ink" : ""}>{c}</div></div>)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
