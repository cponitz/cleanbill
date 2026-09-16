import type { Metadata } from "next";
import { PhotoSlot } from "@/components/ui";
import { ABOUT } from "@/lib/site";

export const metadata: Metadata = { title: "About" };

// About (SPEC-07 §09): mission + story on the left; photo slot + 2×2 principle cards on the right.
export default function AboutPage() {
  return (
    <div className="wrap section grid gap-10 md:grid-cols-2 md:gap-16">
      <div className="flex flex-col gap-6">
        <h1 className="h1">{ABOUT.h1}</h1>
        <p className="lead">{ABOUT.story}</p>
      </div>
      <div className="flex flex-col gap-4">
        <PhotoSlot label={ABOUT.photo} style={{ height: 260 }} />
        <div className="grid gap-3 sm:grid-cols-2">
          {ABOUT.principles.map(([t, b]) => (
            <div key={t} className="card" style={{ borderRadius: 14, padding: 18, gap: 0 }}>
              <p className="text-[14px] text-body"><b className="text-ink">{t}</b> {b}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
