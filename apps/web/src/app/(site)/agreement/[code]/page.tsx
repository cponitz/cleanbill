import type { Metadata } from "next";
import { Agreement } from "@/components/Agreement";
import { normalizeCode } from "@/lib/api";

export const metadata: Metadata = { title: "Service Agreement", robots: { index: false, follow: false } };

export default async function AgreementPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  return <div className="wrap section" style={{ maxWidth: 880 }}><Agreement code={normalizeCode(decodeURIComponent(raw)) ?? ""} /></div>;
}
