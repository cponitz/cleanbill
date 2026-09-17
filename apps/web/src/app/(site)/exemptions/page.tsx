import type { Metadata } from "next";
import { AddressPill } from "@/components/InquiryForms";
import { Pill } from "@/components/ui";
import { EXEMPTIONS } from "@/lib/site";

export const metadata: Metadata = { title: "Exemptions" };

// Exemptions (SPEC-07 §06): hero with the search pill, 2×2 exemption cards (homestead highlighted), navy "What you'll need".
export default function ExemptionsPage() {
  return (
    <div className="wrap section flex flex-col gap-10">
      <section className="grid items-end gap-8 md:grid-cols-2 md:gap-16">
        <div className="flex flex-col gap-4">
          <h1 className="h1">{EXEMPTIONS.h1}</h1>
          <p className="lead">{EXEMPTIONS.lead}</p>
        </div>
        <div id="check" style={{ scrollMarginTop: 24 }}><AddressPill /></div>
      </section>
      <div className="grid-2">
        {EXEMPTIONS.cards.map((c) => (
          <div key={c.title} className={`card ${c.highlight ? "card-highlight" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="h3" style={{ fontSize: 22 }}>{c.title}</div>
              {c.pill && <Pill small>{c.pill}</Pill>}
            </div>
            <p className="body-lg">{c.body}</p>
            {c.highlight ? <a href="#check" className="link-arrow">{c.link}</a> : <a href={EXEMPTIONS.learnMoreUrl} target="_blank" rel="noopener" className="link-arrow">{c.link}</a>}
          </div>
        ))}
      </div>
      <section className="card card-dark grid gap-8 md:grid-cols-2" style={{ padding: 48, borderRadius: 24 }}>
        <div className="flex flex-col gap-3"><h2 className="h2" style={{ fontSize: 32 }}>{EXEMPTIONS.needTitle}</h2><p className="body-lg">{EXEMPTIONS.needSub}</p></div>
        <ul className="m-0 flex list-none flex-col gap-3 p-0 body-lg" style={{ color: "var(--color-on-dark-strong)" }}>
          {EXEMPTIONS.need.map((n) => <li key={n} className="flex gap-4"><span style={{ color: "var(--color-primary-soft)" }}>—</span>{n}</li>)}
        </ul>
      </section>
    </div>
  );
}
