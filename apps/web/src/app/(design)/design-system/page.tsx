import type { Metadata } from "next";
import { DesignSystem } from "@/components/DesignSystem";

// SPEC-08 Part C (C6): the living style guide. No nav link points here; robots noindex. Everything on the page is rendered
// from the live CSS tokens (getComputedStyle), so it can never drift from what the site ships.
export const metadata: Metadata = { title: "Design system", robots: { index: false, follow: false } };

export default function Page() {
  return <DesignSystem />;
}
