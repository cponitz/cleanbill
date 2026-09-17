// The style guide has its own slim chrome (no marketing nav, no footer links): the logo and a theme toggle live inside
// the DesignSystem component.
export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
