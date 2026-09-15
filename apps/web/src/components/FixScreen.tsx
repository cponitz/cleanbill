"use client";
// SPEC-02 §1: the "fix" state for needs_dl_update — what did not match (both addresses side by side, from the
// address_mismatch finding's detail), the DPS link, what DPS asks for, the expected time, and one file input that posts
// to the re-upload path (§2). Events: dl_fix_started is posted by the parent when this screen is shown; dl_fix_uploaded here.
import { useState } from "react";
import { type Finding, postEvent, submitClaim } from "@/lib/api";
import { DPS_URL, FIX, LICENSE, TCAD_URL } from "@/lib/copy";
import { toJpegIfHeic } from "@/lib/heic";

export function FixScreen({ code, claimId, situs, findings, onReuploaded }: { code: string; claimId: string; situs: string; findings: Finding[]; onReuploaded: () => void }) {
  const mismatch = findings.find((f) => f.code === "address_mismatch");
  const idAddress = String(mismatch?.detail?.id ?? "");
  const property = String(mismatch?.detail?.situs ?? situs);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section data-testid="fix-screen">
      <h1>{FIX.title}</h1>
      <p>{FIX.body(idAddress || "…", property)}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="card"><div className="note">{FIX.onId}</div><div className="font-semibold" data-testid="fix-id-address">{idAddress || "—"}</div></div>
        <div className="card"><div className="note">{FIX.onRoll}</div><div className="font-semibold" data-testid="fix-situs">{property}</div></div>
      </div>
      <h2>{FIX.fastest}</h2>
      <p className="note">{FIX.dpsAsks}</p>
      <a className="btn btn-secondary" href={DPS_URL} target="_blank" rel="noopener">{FIX.dpsLink} ↗</a>
      <p className="mt-4">{FIX.then}</p>
      <div className="file">
        <label htmlFor="fix_front" className="font-semibold">📷 {FIX.upload}</label>
        <input id="fix_front" name="dl_front" type="file" accept="image/*,application/pdf,.heic,.heif" capture="environment"
          onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setErr(null); try { setFile(await toJpegIfHeic(f)); } catch { setErr(LICENSE.fileTooBig); } }} />
        {file && <div className="note mt-1">✓ {file.name}</div>}
      </div>
      {err && <p className="err mt-2" role="alert">{err}</p>}
      <button className="btn mt-3" data-testid="btn-fix-upload" disabled={!file || busy} onClick={async () => {
        if (!file) return;
        setBusy(true); setErr(null);
        const fd = new FormData(); fd.set("c", code); fd.set("dl_front", file);
        const r = await submitClaim(fd).catch(() => null);
        setBusy(false);
        if (r && r.ok) { postEvent(code, "dl_fix_uploaded", { claim_id: claimId }); onReuploaded(); }
        else setErr((r && "errors" in r && r.errors?.[0]) || (r && "reason" in r && r.reason) || "Upload failed. Please try again.");
      }}>{busy ? "Uploading…" : FIX.submit}</button>
      <p className="note mt-3">{FIX.hold} {FIX.free.split("traviscad.org")[0]}<a href={TCAD_URL} target="_blank" rel="noopener">traviscad.org</a>{FIX.free.split("traviscad.org")[1]}</p>
    </section>
  );
}
