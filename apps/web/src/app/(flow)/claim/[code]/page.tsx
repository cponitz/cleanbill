import type { Metadata } from "next";
import { ClaimFlow } from "@/components/ClaimFlow";
import { normalizeCode } from "@/lib/api";
import { ERRORS } from "@/lib/copy";

export const metadata: Metadata = { title: "Your claim", robots: { index: false, follow: false } };

export default async function ClaimPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(decodeURIComponent(raw));
  if (!code) return (<div className="flow pt-10"><h1 className="flow-title">{ERRORS.notFound}</h1><p className="text-body mt-3">{ERRORS.notFoundHelp}</p></div>);
  return <ClaimFlow code={code} />;
}
