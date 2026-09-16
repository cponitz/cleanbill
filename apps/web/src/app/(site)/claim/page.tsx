import type { Metadata } from "next";
import { ClaimCodeEntry } from "@/components/ClaimCodeEntry";
import { CODE_PAGE } from "@/lib/copy";

export const metadata: Metadata = { title: "Enter your claim code", robots: { index: false, follow: false } };

// /claim (SPEC-07 §11): the landing from the mailed letter — also where "Sign in" goes, because the claim code is the
// credential (ADR 0008); there is no password and no account to sign in to.
export default function ClaimCodePage() {
  return (
    <div className="wrap section grid items-start justify-center gap-6 md:grid-cols-[minmax(0,420px)]">
      <ClaimCodeEntry />
      <div className="card card-tint card-sm" style={{ gap: 6 }}>
        <div className="h3" style={{ fontSize: 16, color: "var(--teal-deep)" }}>{CODE_PAGE.whyTitle}</div>
        <p className="text-[14px] text-body">{CODE_PAGE.whyBody}</p>
      </div>
    </div>
  );
}
