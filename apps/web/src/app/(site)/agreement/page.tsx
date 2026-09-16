import type { Metadata } from "next";
import { Agreement } from "@/components/Agreement";

export const metadata: Metadata = { title: "Service Agreement" };

// The footer's "Service agreement" link: the same text without a claim, so the property and years read as placeholders.
export default function AgreementIndexPage() {
  return <div className="wrap section" style={{ maxWidth: 880 }}><Agreement code="" /></div>;
}
