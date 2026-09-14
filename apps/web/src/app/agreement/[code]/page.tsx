import type { Metadata } from "next";
import { Agreement } from "@/components/Agreement";
import { normalizeCode } from "@/lib/api";

export const metadata: Metadata = { title: "Service Agreement — Texas Refund Desk", robots: { index: false, follow: false } };

export default async function AgreementPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  return <Agreement code={normalizeCode(decodeURIComponent(raw)) ?? ""} />;
}
