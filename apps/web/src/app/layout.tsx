import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter_Tight, Source_Serif_4 } from "next/font/google";
import "./globals.css";
// SPEC-08 Part C: the two themes. Which one the site uses is the one line below (O-13); both files are loaded so the
// /design-system toggle (and `?theme=`) can switch the whole site without a deploy.
import "@/styles/theme-handoff.css";
import "@/styles/theme-brief.css";
import { THEME_COLOR } from "@/styles/brand.generated";
import { API_BASE } from "@/lib/api";
import { BRAND, META_DESCRIPTION } from "@/lib/copy";
import { ThemeScript, type ThemeName } from "@/components/ThemeScript";

export const DEFAULT_THEME: ThemeName = "handoff";

// Fonts are self-hosted by next/font at build time; nothing loads from Google Fonts at runtime. DM Sans is the handoff
// theme's only typeface (variable weight, optical-size axis). Inter Tight and Source Serif 4 are the brief theme's pairing;
// they are not preloaded, so the default theme pays nothing for them.
const dmSans = DM_Sans({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-dm", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], weight: "variable", variable: "--font-inter-tight", display: "swap", preload: false });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], weight: "variable", axes: ["opsz"], variable: "--font-source-serif", display: "swap", preload: false });

const SITE = "https://cleanbillco.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),   // SPEC-08 A3 (B-19): canonical URL base
  alternates: { canonical: "./" },
  title: { default: BRAND, template: `%s — ${BRAND}` },
  description: META_DESCRIPTION,
  robots: { index: true, follow: false },
  icons: {
    icon: [{ url: "/brand/favicon.svg", type: "image/svg+xml" }, { url: "/brand/favicon.ico", sizes: "32x32" }],
    apple: "/brand/apple-touch-icon.png",
  },
  openGraph: { siteName: BRAND, type: "website", images: [{ url: "/brand/og.png", width: 1200, height: 630, alt: BRAND }] },
  twitter: { card: "summary_large_image" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: THEME_COLOR };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} className={`${dmSans.variable} ${interTight.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
        {/* The claim page's first paint waits on GET /claim; opening the connection early saves ~300 ms on mobile (Lighthouse). */}
        <link rel="preconnect" href={new URL(API_BASE).origin} crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
