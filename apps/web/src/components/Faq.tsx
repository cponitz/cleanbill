"use client";
// FAQ (SPEC-07 §05): sticky category rail (chips on mobile) + accordion cards, one open at a time, 200 ms height
// transition, "+" rotating to "×". Selecting a category scrolls to and opens its first question.
import { useState } from "react";
import { FAQ } from "@/lib/site";

export function Faq() {
  const [open, setOpen] = useState(0);
  const [cat, setCat] = useState(FAQ.categories[0][0]);

  const pick = (c: string) => {
    setCat(c);
    const i = FAQ.items.findIndex((it) => it.cat === c);
    if (i >= 0) { setOpen(i); document.getElementById(`faq-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };
  const activeCat = FAQ.items[open]?.cat ?? cat;

  const rail = (cls: string, short: boolean) => (
    <div className={cls} role="tablist" aria-label="Categories">
      {FAQ.categories.map(([id, long, shortLabel]) => (
        <button key={id} type="button" role="tab" aria-selected={activeCat === id} className={activeCat === id ? "active" : ""} onClick={() => pick(id)}>{short ? shortLabel : long}</button>
      ))}
    </div>
  );

  return (
    <div className="grid gap-8 md:grid-cols-[300px_1fr] md:gap-16">
      <div>
        <h1 className="h1 mb-6" style={{ fontSize: 44 }}>{FAQ.h1}</h1>
        {rail("faq-cats", false)}
        <div className="faq-chips-wrap">{rail("faq-chips", true)}</div>
      </div>
      <div className="flex flex-col gap-3">
        {FAQ.items.map((it, i) => (
          <div key={it.q} id={`faq-${i}`} className="acc" data-open={open === i} style={{ scrollMarginTop: 24 }}>
            <button type="button" className="acc-q" aria-expanded={open === i} aria-controls={`faq-a-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
              {it.q}<span aria-hidden="true">+</span>
            </button>
            <div className="acc-a" id={`faq-a-${i}`} role="region" aria-hidden={open !== i}><div><p>{it.a}</p></div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
