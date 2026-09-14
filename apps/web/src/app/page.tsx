import { LANDING, SUPPORT_EMAIL, TCAD_URL } from "@/lib/copy";
import { CodeForm } from "@/components/CodeForm";

// Landing (SPEC-04b §2): what this is, "filing is free at TCAD", the math, trust signals, no urgency tricks.
export default function Home() {
  return (
    <>
      <h1>{LANDING.h1}</h1>
      <CodeForm />
      <section className="card mt-4">
        <p className="mt-0"><b>{LANDING.what}</b> {LANDING.whatBody}</p>
        <p>
          <b>{LANDING.free}</b> at <a href={TCAD_URL} target="_blank" rel="noopener">traviscad.org</a>. {LANDING.freeBody}
        </p>
        <p className="note mb-0">Questions: {SUPPORT_EMAIL}</p>
      </section>
      <section className="mt-4">
        <h2>{LANDING.mathTitle}</h2>
        <ol className="list-decimal space-y-2 pl-5">
          {LANDING.math.map((s) => <li key={s}>{s}</li>)}
        </ol>
      </section>
    </>
  );
}
