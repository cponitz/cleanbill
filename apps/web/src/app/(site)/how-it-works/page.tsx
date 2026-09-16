import type { Metadata } from "next";
import { PhotoSlot } from "@/components/ui";
import { HOW } from "@/lib/site";

export const metadata: Metadata = { title: "How it works" };

// How it works (SPEC-07 §04): four rows — STEP n / title / timing · paragraph · screenshot slot.
export default function HowItWorksPage() {
  return (
    <div className="wrap section flex flex-col gap-10">
      <header className="flex flex-col gap-4" style={{ maxWidth: 800 }}>
        <h1 className="h1">{HOW.h1}</h1>
        <p className="lead">{HOW.lead}</p>
      </header>
      <div className="flex flex-col">
        {HOW.steps.map((s) => (
          <div key={s.n} className="step-row">
            <div className="flex flex-col gap-1 max-md:flex-row max-md:items-baseline max-md:gap-3">
              <div className="eyebrow" style={{ fontSize: 13, fontWeight: 700 }}>Step {s.n}</div>
              <div className="h3 max-md:hidden" style={{ fontSize: 22 }}>{s.title}</div>
              <div className="fine">{s.timing}</div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="h3 md:hidden" style={{ fontSize: 22 }}>{s.title}</div>
              <p className="body-lg">{s.body}</p>
            </div>
            <PhotoSlot label={s.shot} style={{ height: 180, borderRadius: 16 }} />
          </div>
        ))}
        <div className="hairline-top" />
      </div>
    </div>
  );
}
