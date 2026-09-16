"use client";
// SPEC-02 §1: the "fix" state for needs_dl_update — what did not match (both addresses side by side, from the
// address_mismatch finding's detail), the DPS link, what DPS asks for, the expected time, and one file input that posts
// to the re-upload path (§2). Events: dl_fix_started is posted by the parent when this screen is shown; dl_fix_uploaded here.
import { useState } from "react";
import { type Finding, postEvent, submitClaim } from "@/lib/api";
import { DPS_URL, FIX, LICENSE, TCAD_URL } from "@/lib/copy";
import { toJpegIfHeic } from "@/lib/heic";
import { Pill, Progress } from "./ui";

export function FixScreen({ code, claimId, situs, findings, onReuploaded }: { code: string; claimId: string; situs: string; findings: Finding[]; onReuploaded: () => void }) {
  const mismatch = findings.find((f) => f.code === "address_mismatch");
  const idAddress = String(mismatch?.detail?.id ?? "");
  const property = String(mismatch?.detail?.situs ?? situs);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section data-testid="fix-screen" className="flex flex-col gap-4">
      <Progress done={5} total={5} thin />
      <Pill tone="sand" small>Needs attention</Pill>
      <h1 className="flow-title">{FIX.title}</h1>
      <p className="text-body">{FIX.body(idAddress || "…", property)}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="card card-sm" style={{ gap: 4, borderColor: "var(--error)", background: "var(--error-bg)" }}><div className="fine">{FIX.onId}</div><div className="font-semibold text-ink" data-testid="fix-id-address">{idAddress || "—"}</div></div>
        <div className="card card-sm" style={{ gap: 4 }}><div className="fine">{FIX.onRoll}</div><div className="font-semibold text-ink" data-testid="fix-situs">{property}</div></div>
      </div>
      <div className="h3" style={{ fontSize: 17 }}>{FIX.fastest}</div>
      <p className="fine">{FIX.dpsAsks}</p>
      <a className="btn btn-outline self-start" href={DPS_URL} target="_blank" rel="noopener">{FIX.dpsLink} ↗</a>
      <p className="text-body">{FIX.then}</p>
      <label className={`upload relative ${file ? "upload-done" : ""}`} htmlFor="fix_front">
        <input id="fix_front" name="dl_front" type="file" accept="image/*,application/pdf,.heic,.heif" capture="environment"
          onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setErr(null); try { setFile(await toJpegIfHeic(f)); } catch { setErr(LICENSE.fileTooBig); } }} />
        <span className="font-semibold text-ink">{file ? LICENSE.chosen(file.name) : FIX.upload}</span>
        <span className="fine">{file ? LICENSE.retake : LICENSE.cameraHint}</span>
      </label>
      {err && <p className="field-error" role="alert">{err}</p>}
      <p className="fine">{FIX.hold} {FIX.free.split("traviscad.org")[0]}<a href={TCAD_URL} target="_blank" rel="noopener">traviscad.org</a>{FIX.free.split("traviscad.org")[1]}</p>
      <div className="flow-cta"><div className="flow-cta-inner">
        <button className="btn btn-l btn-block" data-testid="btn-fix-upload" disabled={!file || busy} onClick={async () => {
          if (!file) return;
          setBusy(true); setErr(null);
          const fd = new FormData(); fd.set("c", code); fd.set("dl_front", file);
          const r = await submitClaim(fd).catch(() => null);
          setBusy(false);
          if (r && r.ok) { postEvent(code, "dl_fix_uploaded", { claim_id: claimId }); onReuploaded(); }
          else setErr((r && "errors" in r && r.errors?.[0]) || (r && "reason" in r && r.reason) || FIX.failed);
        }}>{busy ? FIX.uploading : FIX.submit}</button>
      </div></div>
    </section>
  );
}
