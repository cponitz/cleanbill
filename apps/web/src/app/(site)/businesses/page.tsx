import type { Metadata } from "next";
import { BusinessForm } from "@/components/InquiryForms";
import { BUSINESSES } from "@/lib/site";

export const metadata: Metadata = { title: "Businesses" };

// Businesses (SPEC-07 §08): hero + "Request a portfolio review" form, three service cards (the third in sand).
export default function BusinessesPage() {
  return (
    <div className="wrap section flex flex-col gap-14">
      <section className="grid items-center gap-8 md:grid-cols-[1.1fr_.9fr] md:gap-16">
        <div className="flex flex-col gap-5">
          <div className="eyebrow eyebrow-sand">{BUSINESSES.eyebrow}</div>
          <h1 className="h1">{BUSINESSES.h1}</h1>
          <p className="lead">{BUSINESSES.lead}</p>
        </div>
        <BusinessForm />
      </section>
      <div className="grid-3">
        {BUSINESSES.cards.map((c) => (
          <div key={c.title} className={`card ${c.sand ? "card-sand" : ""}`} style={{ gap: 10 }}>
            <div className={`eyebrow eyebrow-sm ${c.sand ? "eyebrow-sand" : ""}`}>{c.eyebrow}</div>
            <div className="h3">{c.title}</div>
            <p className="text-[15px] text-muted">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
