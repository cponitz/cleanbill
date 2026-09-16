import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

// Marketing pages, the claim-code entry, the status page and the agreement share the SPEC-07 nav + footer chrome.
// The signup flow (/claim/[code]) has its own slim chrome in the (flow) group.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
