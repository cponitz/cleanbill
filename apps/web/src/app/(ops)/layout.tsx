// The operator console (SPEC-09) has its own chrome inside the Ops component: no marketing nav, no footer links.
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
