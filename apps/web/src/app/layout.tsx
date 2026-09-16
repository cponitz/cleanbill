import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { API_BASE } from "@/lib/api";
import { BRAND, META_DESCRIPTION } from "@/lib/copy";

// SPEC-07: DM Sans (400–700, optical-size axis) is the only typeface. next/font self-hosts it at build time, so the page
// never waits on Google Fonts at runtime.
const dmSans = DM_Sans({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-dm", display: "swap" });

export const metadata: Metadata = {
  title: { default: BRAND, template: `%s — ${BRAND}` },
  description: META_DESCRIPTION,
  robots: { index: true, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F7FAFA" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <head>
        {/* The claim page's first paint waits on GET /claim; opening the connection early saves ~300 ms on mobile (Lighthouse). */}
        <link rel="preconnect" href={new URL(API_BASE).origin} crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
