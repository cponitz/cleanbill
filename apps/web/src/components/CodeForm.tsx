"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeCode } from "@/lib/api";
import { LANDING } from "@/lib/copy";

export function CodeForm() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        const code = normalizeCode(raw);
        if (!code) { setBad(true); return; }
        router.push(`/claim/${code}`);
      }}
    >
      <label htmlFor="code" className="mb-1 mt-3 block font-semibold">{LANDING.codeLabel}</label>
      <input id="code" name="c" className="input uppercase tracking-wide" placeholder={LANDING.codePlaceholder} autoComplete="off" autoCapitalize="characters"
        value={raw} onChange={(e) => { setRaw(e.target.value); setBad(false); }} aria-invalid={bad} aria-describedby={bad ? "code-err" : undefined} />
      {bad && <p id="code-err" className="err mt-2" role="alert">{LANDING.badCode}</p>}
      <button type="submit" className="btn mt-3">{LANDING.open}</button>
    </form>
  );
}
