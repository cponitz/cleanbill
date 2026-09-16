// The claim status enum (docs/ARCHITECTURE.md §4.3, unchanged) mapped onto the SPEC-07 portal vocabulary: a pill, a
// colour and how far along the six-stage progress row the claim is. The API enum stays the key everywhere else.
export type PillTone = "neutral" | "teal" | "sand" | "ok" | "bad" | "off";

export const PILL: Record<string, { label: string; tone: PillTone }> = {
  submitted: { label: "Received", tone: "neutral" },
  processing: { label: "Received", tone: "neutral" },
  ready_to_submit: { label: "Ready to review", tone: "teal" },
  needs_dl_update: { label: "Needs attention", tone: "sand" },
  needs_review: { label: "Needs attention", tone: "sand" },
  filed: { label: "Submitted to TCAD", tone: "teal" },
  approved: { label: "Approved", tone: "ok" },
  refunded: { label: "Refund issued", tone: "ok" },
  paid: { label: "Refund issued", tone: "ok" },
  denied: { label: "Denied", tone: "bad" },
  withdrawn: { label: "Cancelled", tone: "off" },
};

/** Stage index reached (0 received … 5 refund issued) — mirrors `stageIndex` in supabase/functions/claim/logic.ts. */
export function stageIndex(status: string): number {
  switch (status) {
    case "ready_to_submit": return 1;
    case "filed": return 3;
    case "approved": case "denied": return 4;
    case "refunded": case "paid": return 5;
    default: return 0;
  }
}

export const TERMINAL = new Set(["denied", "withdrawn"]);
