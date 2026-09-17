import type { Metadata } from "next";
import { Ops } from "@/components/Ops";

// SPEC-09 D2: the operator console. No link from the marketing site; robots noindex; the ops password is the gate
// (O-05: Supabase Auth in Phase 2). Everything it shows comes from GET /ops; every action is a POST /ops (ADR 0020).
export const metadata: Metadata = { title: "Ops", robots: { index: false, follow: false } };

export default function Page() {
  return <Ops />;
}
