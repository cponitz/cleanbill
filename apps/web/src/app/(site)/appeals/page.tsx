import type { Metadata } from "next";
import { AppealCard } from "@/components/InquiryForms";
import { APPEALS } from "@/lib/site";

export const metadata: Metadata = { title: "Property-tax appeals" };

// Appeals (SPEC-07 §07): hero + "Check your appraisal" card, three numbered cards, "Appeal or exemption?" callout.
export default function AppealsPage() {
  return (
    <div className="wrap section flex flex-col gap-12">
      <section className="grid items-end gap-8 md:grid-cols-[1.1fr_.9fr] md:gap-16">
        <div className="flex flex-col gap-5">
          <div className="eyebrow">{APPEALS.eyebrow}</div>
          <h1 className="h1">{APPEALS.h1}</h1>
          <p className="lead">{APPEALS.lead}</p>
        </div>
        <AppealCard />
      </section>
      <div className="grid-3">
        {APPEALS.steps.map(([t, b], i) => (
          <div key={t} className="card" style={{ gap: 10 }}>
            <div className="eyebrow eyebrow-sm">0{i + 1}</div>
            <div className="h3">{t}</div>
            <p className="text-[15px] text-muted">{b}</p>
          </div>
        ))}
      </div>
      <section className="callout grid items-center gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col gap-4">
          <h2 className="h2 h2-callout">{APPEALS.both.title}</h2>
          <p className="body-lg">{APPEALS.both.body}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[APPEALS.both.exemption, APPEALS.both.appeal].map(([t, a, b]) => (
            <div key={t} className="card card-sm" style={{ gap: 6 }}><div className="h3" style={{ fontSize: 16 }}>{t}</div><p className="text-[14px] text-body">{a}</p><p className="text-[14px] text-body">{b}</p></div>
          ))}
        </div>
      </section>
    </div>
  );
}
