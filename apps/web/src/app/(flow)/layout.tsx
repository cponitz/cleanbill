import { Logo } from "@/components/ui";
import { HEADER } from "@/lib/copy";

// The signup flow's chrome (SPEC-07 §02 is a phone screen with no site nav): the logo and the compliance line from
// copy/claim_page.md's header. The flow itself renders the step bar, the content and the pinned CTA.
export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="nav">
        <div className="wrap nav-inner" style={{ padding: "14px 0" }}>
          <Logo />
          <span className="fine max-sm:hidden">{HEADER.sub}</span>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
