import type { Metadata } from "next";
import { StatusView } from "@/components/StatusView";
import { normalizeCode } from "@/lib/api";
import { ERRORS } from "@/lib/copy";

export const metadata: Metadata = { title: "Claim status", robots: { index: false, follow: false } };

export default async function StatusPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(decodeURIComponent(raw));
  if (!code) return (<div className="wrap section"><h1 className="h2">{ERRORS.notFound}</h1><p className="lead mt-3">{ERRORS.notFoundHelp}</p></div>);
  return <StatusView code={code} />;
}
