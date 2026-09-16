import { SiteFooter } from "@/components/SiteFooter";

// The portal (SPEC-07 §10) renders its own nav variant from inside StatusView (it needs the customer's initials from
// the claim), so this group supplies only the footer.
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
