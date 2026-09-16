import Link from "next/link";
import { FOOTER, SUPPORT_EMAIL } from "@/lib/copy";

// SPEC-07 footer: one-line disclaimer (max-width 640) + Pricing · FAQ · Service agreement · support e-mail. Stacks on mobile.
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap footer-inner">
        <p style={{ maxWidth: 640 }}>{FOOTER.disclaimer}</p>
        <nav className="footer-links" aria-label="Footer">
          {FOOTER.links.map(([t, href]) => <Link key={href} href={href}>{t}</Link>)}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
        </nav>
      </div>
    </footer>
  );
}
