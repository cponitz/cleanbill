import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { FOOTER, HEADER } from "@/lib/copy";

export const metadata: Metadata = {
  title: "Texas Refund Desk",
  description: "Retroactive residence homestead exemption refunds for Travis County homeowners. Filing is free at TCAD; our fee is 25% of the refund you actually receive, $0 otherwise.",
  robots: { index: true, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-[640px] px-[18px] pb-16 pt-4">
          <header className="mb-2 border-b border-line pb-3 pt-2">
            <Link href="/" className="text-[20px] font-bold text-navy no-underline">{HEADER.brand}</Link>
            <div className="text-[12px] text-grey">{HEADER.sub}</div>
          </header>
          <main>{children}</main>
          <footer className="mt-10 border-t border-line pt-3 text-[12px] text-grey">{FOOTER}</footer>
        </div>
      </body>
    </html>
  );
}
