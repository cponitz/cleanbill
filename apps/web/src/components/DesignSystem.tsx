"use client";
/* eslint-disable @next/next/no-img-element -- the brand assets are SVGs and small PNGs shown at their own size */
// The living style guide (/design-system, SPEC-08 Part C, C6). Every swatch and specimen reads its value from the
// document's computed styles, so the page shows exactly what the CSS ships in the current theme. The theme toggle sets
// data-theme on <html> and remembers it (localStorage), which switches the whole site for this browser.
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { BRAND } from "@/lib/copy";
import { PILL } from "@/lib/status";
import { THEME_KEY, THEMES, type ThemeName } from "./ThemeScript";
import { Checkbox, ChoiceGroup, Field, Logo, Mark, Pill, Progress, StatusBadge, StatusPill } from "./ui";

const COLOR_TOKENS = [
  "bg", "surface", "ink", "body", "muted", "placeholder", "primary", "primary-strong", "primary-tint", "primary-soft", "on-primary",
  "dark", "on-dark", "on-dark-strong", "accent", "accent-text", "accent-body", "amount", "line", "hairline", "row-tint",
  "success", "success-bg", "error", "error-bg", "disabled", "scrim", "line-on-dark", "photo-a", "photo-b",
];
const OTHER_TOKENS = [
  "shadow-hero", "shadow-pill", "ring", "font-body", "font-heading", "font-code", "numeric-amount",
  "space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-7", "space-8", "gutter",
  "radius-pill", "radius-input", "radius-card-sm", "radius-card", "radius-callout", "radius-check",
  "duration-fast", "duration-base", "duration-slow", "ease",
  "text-xs", "text-sm", "text-base", "text-md", "text-lg", "text-xl", "text-2xl", "text-h3", "text-h2", "text-h1", "text-display", "text-stat", "text-amount",
  "leading-tight", "leading-snug", "leading-normal", "leading-relaxed", "tracking-tight", "tracking-eyebrow", "tracking-mono", "bp-sm", "bp-lg",
];
const SPACES = ["space-1", "space-2", "space-3", "space-4", "space-5", "space-6", "space-7", "space-8"];
const TYPE = [
  ["display", "Display · 68/1.0 · 700"], ["h1", "H1 · 52/1.05 · 700"], ["h2", "H2 · 36/1.15 · 700"], ["h3", "H3 · 20/1.3 · 600"],
  ["lead", "Lead · 19/1.5"], ["body-lg", "Body-lg · 16/1.55"], ["text-body", "Body · 15/1.5"], ["fine", "Fine · 13/1.55 · muted"],
  ["eyebrow", "Eyebrow · 14/600 · .08em caps"], ["stat", "Stat · 32/700"], ["amount", "Amount · 48/700 · tabular"], ["mono-lg", "Mono · code"],
];
const SECTIONS: Array<[string, string]> = [
  ["tokens", "Colour tokens"], ["type", "Type"], ["spacing", "Spacing & radii"], ["other", "Other tokens"], ["buttons", "Buttons"],
  ["inputs", "Inputs"], ["choices", "Choices"], ["cards", "Cards"], ["pills", "Pills & status"], ["tables", "Tables & KPIs"],
  ["toolbar", "Toolbar & drawer"], ["nav", "Nav & footer"], ["brand", "Wordmark & mark"], ["email", "E-mail template"],
];

// The theme is the `data-theme` attribute on <html> (set by ThemeScript before paint, changed by the toggle). It is read as
// an external store so the page re-renders when the attribute changes and never sets state inside an effect.
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;
function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!observer) {
    observer = new MutationObserver(() => listeners.forEach((l) => l()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  return () => { listeners.delete(cb); };
}
const getTheme = (): ThemeName => (document.documentElement.getAttribute("data-theme") as ThemeName) || "handoff";
const EMPTY: Record<string, string> = {};
const tokenCache = new Map<ThemeName, Record<string, string>>();
function readTokens(): Record<string, string> {
  const theme = getTheme();
  let out = tokenCache.get(theme);
  if (!out) {
    const cs = getComputedStyle(document.documentElement);
    out = {};
    for (const t of [...COLOR_TOKENS.map((c) => `color-${c}`), ...OTHER_TOKENS]) out[t] = cs.getPropertyValue(`--${t}`).trim();
    tokenCache.set(theme, out);
  }
  return out;
}

export function DesignSystem() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "handoff" as ThemeName);
  const values = useSyncExternalStore(subscribe, readTokens, () => EMPTY);
  const [drawer, setDrawer] = useState(false);
  const [choice, setChoice] = useState("yes");
  const [checked, setChecked] = useState(true);

  function choose(t: ThemeName) {
    document.documentElement.setAttribute("data-theme", t);   // the observer above re-renders the page
    try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  }

  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 80 }}>
      <header className="flex flex-wrap items-center justify-between gap-4 pb-6 hairline-top" style={{ borderTop: 0 }}>
        <div className="flex items-center gap-4"><Logo /><span className="pill pill-sm pill-neutral">design system</span></div>
        <div className="toolbar" role="group" aria-label="Theme" style={{ padding: 0 }}>
          <span className="fine">Theme</span>
          {THEMES.map((t) => (
            <button key={t} type="button" className={`btn btn-sm ${theme === t ? "" : "btn-neutral"}`} aria-pressed={theme === t} onClick={() => choose(t)} data-testid={`theme-${t}`}>{t}</button>
          ))}
        </div>
      </header>
      <p className="lead" style={{ maxWidth: 720 }}>
        Every token, component state and asset the {BRAND} site, letters, packet and e-mails are built from — rendered from the live CSS in the
        <b> {theme}</b> theme. Switching the theme here switches the whole site for this browser (<code className="mono">?theme=brief</code> works on any page).
        The written guide is <code className="mono">docs/DESIGN-SYSTEM.md</code>.
      </p>
      <nav className="ds-toc mt-4" aria-label="Sections">{SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}</nav>

      <Section id="tokens" title="Colour tokens" sub="Semantic names (what components read). The value shown is the current theme's resolved primitive.">
        <div className="ds-swatches">
          {COLOR_TOKENS.map((c) => (
            <div key={c} className="ds-swatch" data-token={`color-${c}`}>
              <div className="ds-swatch-chip" style={{ background: `var(--color-${c})` }} />
              <div className="ds-swatch-meta"><b>--color-{c}</b><span>{values[`color-${c}`] || "…"}</span></div>
            </div>
          ))}
        </div>
      </Section>

      <Section id="type" title="Type ramp" sub={`Body ${values["font-body"]?.split(",")[0] || "…"} · headings ${values["font-heading"]?.split(",")[0] || "…"} · code ${values["font-code"]?.split(",")[0] || "…"}`}>
        {TYPE.map(([cls, label]) => (
          <div key={cls} className="ds-specimen"><span>.{cls} — {label}</span><span className={cls}>{cls === "amount" ? "$3,700" : cls === "stat" ? "2 years" : cls === "mono-lg" ? "CB-TEST-0001" : cls === "eyebrow" ? "Property-tax refunds" : "Pay what you should. Not a dollar more."}</span></div>
        ))}
      </Section>

      <Section id="spacing" title="Spacing & radii" sub="Spacing scale 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64; radii pill 999, input 12, card-sm 16, card 20, callout 24.">
        <div className="ds-space">
          {SPACES.map((s) => <div key={s}><i style={{ width: `var(--${s})`, height: `var(--${s})` }} />{s.replace("space-", "")} · {values[s]}</div>)}
        </div>
        <div className="ds-row mt-6">
          {["radius-input", "radius-card-sm", "radius-card", "radius-callout"].map((r) => (
            <div key={r} className="card card-sm" style={{ borderRadius: `var(--${r})`, width: 150, padding: 14 }}><b className="mono" style={{ fontSize: 12 }}>--{r}</b><span className="fine">{values[r]}</span></div>
          ))}
          <div className="btn" style={{ pointerEvents: "none" }}>--radius-pill</div>
        </div>
      </Section>

      <Section id="other" title="Other tokens" sub="Elevation, focus ring, type scale, motion, breakpoints.">
        <div className="table-wrap"><table className="table table-dense"><thead><tr><th>Token</th><th>Value</th></tr></thead><tbody>
          {OTHER_TOKENS.map((t) => <tr key={t}><td className="mono">--{t}</td><td className="mono">{values[t] || "…"}</td></tr>)}
        </tbody></table></div>
        <div className="ds-row mt-4">
          <div className="card card-sm card-elevated" style={{ width: 200 }}><b>--shadow-hero</b><span className="fine">elevated card</span></div>
          <div className="search-pill" style={{ width: 260 }}><input placeholder="--shadow-pill" aria-label="Search pill sample" /><button type="button" className="btn btn-sm">Go</button></div>
          <button type="button" className="btn btn-outline" style={{ boxShadow: "var(--ring)" }}>--ring (focus)</button>
        </div>
      </Section>

      <Section id="buttons" title="Buttons" sub="Anatomy: pill, 1.5px border, 15/600 label, 44px minimum target. States: default · hover · focus-visible · disabled · loading.">
        {[["btn", "Primary"], ["btn btn-outline", "Outline"], ["btn btn-neutral", "Neutral"], ["btn btn-bad", "Destructive"], ["btn btn-l", "Large"], ["btn btn-sm", "Small"]].map(([cls, label]) => (
          <div key={cls} className="ds-row" style={{ padding: "8px 0" }}>
            <span className="fine" style={{ width: 90 }}>{label}</span>
            <button type="button" className={cls}>{label}</button>
            <button type="button" className={cls} style={{ boxShadow: "var(--ring)" }}>Focus</button>
            <button type="button" className={cls} disabled>Disabled</button>
            <button type="button" className={cls} aria-busy="true">Loading…</button>
          </div>
        ))}
        <div className="ds-dark ds-row"><button type="button" className="btn btn-white">On dark</button><a className="link-arrow" style={{ color: "var(--color-primary-soft)" }} href="#buttons">Inline link</a></div>
        <a className="link-arrow" href="#buttons">Inline link</a>
      </Section>

      <Section id="inputs" title="Inputs" sub="Anatomy: label · field · hint or error. States: default · focus · error · disabled · small (toolbars).">
        <div className="grid-2">
          <Field id="ds-in-1" label="Home address" hint="Street, city, ZIP"><input id="ds-in-1" className="input" placeholder="3675 Duval St" /></Field>
          <Field id="ds-in-2" label="Focused"><input id="ds-in-2" className="input" defaultValue="3675 Duval St" style={{ boxShadow: "var(--ring)", borderColor: "var(--color-primary)" }} /></Field>
          <Field id="ds-in-3" label="With an error" error="Please enter the property's street address."><input id="ds-in-3" className="input" aria-invalid="true" defaultValue="Duval" /></Field>
          <Field id="ds-in-4" label="Disabled"><input id="ds-in-4" className="input" disabled defaultValue="Not editable" /></Field>
          <Field id="ds-in-5" label="Claim code (mono)"><input id="ds-in-5" className="input input-code" defaultValue="CB-TEST-0001" /></Field>
          <Field id="ds-in-6" label="Small (toolbar)"><input id="ds-in-6" className="input input-sm" placeholder="Filter" /></Field>
        </div>
        <div className="banner-error mt-4" role="status">Something went wrong saving your claim. Please try again.</div>
        <div className="banner-ok mt-2" role="status">Saved.</div>
      </Section>

      <Section id="choices" title="Choices, checkbox, upload" sub="Choice buttons keep a real radio; checkbox is 18px with a 1.5px primary border.">
        <ChoiceGroup name="ds-choice" label="Do you live at this address?" value={choice} onChange={setChoice} options={[["yes", "Yes"], ["no", "No"]]} />
        <div className="mt-4"><Checkbox id="ds-chk" checked={checked} onChange={setChecked}>I have read the Service Agreement and agree to it.</Checkbox></div>
        <div className="grid-2 mt-4">
          <label className="upload"><b>Take a photo of your license</b><span className="fine">JPEG, PNG or HEIC</span><input type="file" /></label>
          <div className="upload upload-done"><b>license.jpg</b><span className="fine">Uploaded</span></div>
        </div>
      </Section>

      <Section id="cards" title="Cards" sub="Standard · elevated · highlight · tint · dark · accent (sand) · callout · photo slot.">
        <div className="grid-3">
          <div className="card"><h3 className="h3">Standard</h3><p className="text-body">1px line, radius 20, padding 28.</p></div>
          <div className="card card-elevated"><h3 className="h3">Elevated</h3><p className="text-body">Hero shadow, hairline border.</p></div>
          <div className="card card-highlight"><h3 className="h3">Highlight</h3><p className="text-body">1.5px primary border.</p></div>
          <div className="card card-tint"><h3 className="h3">Tint</h3><p className="text-body">Primary tint, no border.</p></div>
          <div className="card card-dark"><h3 className="h3">Dark</h3><p>Dark band with on-dark text.</p><div className="ledger ledger-dark"><div className="ledger-row"><span>You keep</span><b>$2,775</b></div></div></div>
          <div className="card card-sand"><div className="eyebrow eyebrow-sm eyebrow-sand">Coming next</div><h3 className="h3">Accent</h3><p>Secondary tint.</p></div>
        </div>
        <div className="callout mt-4"><h2 className="h2 h2-callout">Callout</h2><p className="lead">Tint background, radius 24, padding 56.</p></div>
        <div className="photo mt-4" style={{ height: 120 }}>[ photo slot: hatched until photography exists ]</div>
        <div className="ledger mt-4 card card-sm"><div className="ledger-row"><span>Estimated 2-year refund</span><b className="num">$3,700</b></div><div className="ledger-row"><span>{BRAND} fee (25%)</span><b className="num">$925</b></div><div className="ledger-row"><span>You keep</span><b className="num">$2,775</b></div></div>
      </Section>

      <Section id="pills" title="Pills, badges and the status map" sub="One map in src/lib/status.ts: claim status → label + tone. Pills for the portal, badges for dense tables.">
        <div className="ds-row">{(["neutral", "teal", "sand", "ok", "bad", "off"] as const).map((t) => <Pill key={t} tone={t}>{t}</Pill>)}</div>
        <div className="table-wrap mt-4"><table className="table"><thead><tr><th>Status</th><th>Pill</th><th>Badge</th><th>Tone</th></tr></thead><tbody>
          {Object.entries(PILL).map(([s, p]) => <tr key={s}><td className="mono">{s}</td><td><StatusPill status={s} small /></td><td><StatusBadge status={s} /></td><td>{p.tone}</td></tr>)}
        </tbody></table></div>
        <div className="mt-4" style={{ maxWidth: 420 }}><Progress done={3} total={6} label="Progress sample" /><div className="mt-2"><Progress done={2} total={5} thin label="Thin progress sample" /></div></div>
      </Section>

      <Section id="tables" title="Tables & KPI tiles" sub="SPEC-09: .kpis / .kpi (default · accent · warn · empty · loading) and .table-wrap / .table (dense, selected, empty, busy).">
        <div className="kpis">
          <div className="kpi"><span className="kpi-label">Leads loaded</span><span className="kpi-value">16,776</span><span className="kpi-sub">tier 1–3</span></div>
          <div className="kpi kpi-accent"><span className="kpi-label">Ready to submit</span><span className="kpi-value">4</span></div>
          <div className="kpi kpi-warn"><span className="kpi-label">Needs review</span><span className="kpi-value">2</span></div>
          <div className="kpi kpi-empty"><span className="kpi-label">Refunded</span><span className="kpi-value">—</span><span className="kpi-sub">no data yet</span></div>
          <div className="kpi" aria-busy="true"><span className="kpi-label">Loading</span><span className="kpi-value">0000</span></div>
        </div>
        <div className="table-wrap mt-4"><table className="table"><thead><tr><th>Claim</th><th>Property</th><th>Status</th><th className="num">Estimate</th></tr></thead><tbody>
          <tr><td className="mono">CB-TEST-0001</td><td>3675 Duval St</td><td><StatusBadge status="ready_to_submit" /></td><td className="num">$3,700</td></tr>
          <tr aria-selected="true"><td className="mono">CB-AB12-CD34</td><td>1200 Brodie Ln <span className="fine">(selected)</span></td><td><StatusBadge status="needs_dl_update" /></td><td className="num">$2,100</td></tr>
          <tr><td className="mono">CB-EF56-GH78</td><td>800 W 5th St Unit 12</td><td><StatusBadge status="filed" /></td><td className="num">$1,250</td></tr>
        </tbody></table></div>
        <div className="table-wrap mt-4"><table className="table table-dense"><thead><tr><th>Dense</th><th>Kind</th><th className="num">7 d</th></tr></thead><tbody><tr><td>view</td><td>page</td><td className="num">128</td></tr><tr><td>typed_precheck</td><td>page</td><td className="num">31</td></tr></tbody></table></div>
        <div className="table-wrap mt-4"><div className="table-empty">No claims match this filter.</div></div>
      </Section>

      <Section id="toolbar" title="Toolbar & drawer" sub="SPEC-09: filters and actions in a wrapping row; the claim detail slides in from the right (min(560px, 100vw)).">
        <div className="toolbar card card-sm" style={{ padding: "8px 16px" }}>
          <span className="toolbar-title">Claims</span>
          <select className="input input-sm" aria-label="Status filter" defaultValue="all"><option value="all">All statuses</option><option value="ready_to_submit">Ready to submit</option></select>
          <input className="input input-sm" placeholder="Search" aria-label="Search" />
          <span className="toolbar-spacer" />
          <button type="button" className="btn btn-sm btn-neutral">Reprocess</button>
          <button type="button" className="btn btn-sm btn-bad">Withdraw</button>
          <button type="button" className="btn btn-sm" onClick={() => setDrawer(true)} data-testid="open-drawer">Open drawer</button>
        </div>
        <div className="drawer" data-open={drawer} aria-hidden={!drawer}>
          <div className="drawer-bg" onClick={() => setDrawer(false)} />
          <aside className="drawer-panel" role="dialog" aria-label="Claim detail">
            <div className="drawer-head"><div><div className="eyebrow eyebrow-sm">Claim</div><b className="mono">CB-TEST-0001</b></div><button type="button" className="drawer-close" aria-label="Close" onClick={() => setDrawer(false)}>×</button></div>
            <div className="drawer-body">
              <StatusPill status="ready_to_submit" />
              <div className="ledger"><div className="ledger-row"><span>Property</span><b>3675 Duval St</b></div><div className="ledger-row"><span>Estimate</span><b className="num">$3,700</b></div></div>
              <div className="ds-row"><button type="button" className="btn btn-sm">Approve draft</button><button type="button" className="btn btn-sm btn-neutral">Discard</button><button type="button" className="btn btn-sm btn-outline">Mark filed</button></div>
            </div>
          </aside>
        </div>
      </Section>

      <Section id="nav" title="Nav & footer" sub="The site chrome as built (SPEC-07): nav with the wordmark, hairline borders, muted footer with the disclaimer.">
        <div className="card card-sm" style={{ padding: 0, overflow: "hidden" }}>
          <div className="nav"><div className="nav-inner" style={{ padding: "16px 20px" }}><Logo /><div className="nav-links"><a className="nav-link active" href="#nav">Homeowners</a><a className="nav-link" href="#nav">Pricing</a><a className="nav-link" href="#nav">FAQ</a></div><div className="nav-right"><a className="nav-link" href="#nav">Sign in</a><a className="btn btn-outline" href="#nav">Get started</a></div></div></div>
          <div className="footer" style={{ padding: "24px 20px" }}><div className="footer-inner"><p style={{ maxWidth: 640 }}>{BRAND} is a private company in Austin, Texas, not affiliated with any government agency.</p><div className="footer-links"><a href="#nav">Pricing</a><a href="#nav">FAQ</a></div></div></div>
        </div>
        <div className="mt-4 flex items-center gap-4"><span className="avatar">RG</span><span className="fine">portal avatar</span><span className="check-circle">✓</span><span className="fine">done marker</span><span className="timeline-n">1</span><span className="fine">timeline step</span></div>
      </Section>

      <Section id="brand" title="Wordmark & mark" sub="Original mark: a receipt outline with a check. Files in /brand/ (SVG, favicon, apple-touch, Open Graph 1200×630, e-mail header 600px).">
        <div className="grid-2">
          <div className="card"><img src="/brand/wordmark.svg" alt={`${BRAND} wordmark`} style={{ height: 40, width: "auto" }} /><div className="ds-row mt-2"><Mark size={64} className="text-primary" /><Mark size={32} className="text-ink" /><Mark size={16} className="text-muted" /></div><p className="fine">wordmark.svg · mark.svg (currentColor)</p></div>
          <div className="ds-dark"><img src="/brand/wordmark-dark.svg" alt={`${BRAND} wordmark on dark`} style={{ height: 40, width: "auto" }} /><div className="ds-row mt-2" style={{ color: "var(--color-on-dark-strong)" }}><Mark size={64} /><Mark size={32} /></div><p className="fine" style={{ color: "var(--color-on-dark)" }}>wordmark-dark.svg · mark on dark</p></div>
        </div>
        <div className="ds-row mt-4">
          <img src="/brand/favicon.svg" alt="Favicon" width={48} height={48} /><img src="/brand/apple-touch-icon.png" alt="Apple touch icon" width={60} height={60} style={{ borderRadius: 12 }} />
          <img src="/brand/og.png" alt="Open Graph image" style={{ width: 300, height: "auto", border: "1px solid var(--color-line)", borderRadius: 8 }} />
          <img src="/brand/email-header.png" alt="E-mail header" style={{ width: 300, height: "auto", border: "1px solid var(--color-line)" }} />
        </div>
      </Section>

      <Section id="email" title="E-mail template" sub="trd/email/base.html rendered with a sample message (public/brand/email-sample.html). Every outbound e-mail is wrapped in it from Task 4 on.">
        <iframe className="ds-frame" src="/brand/email-sample.html" title="E-mail template sample" />
      </Section>

      <p className="fine mt-8">Written guide: <code className="mono">docs/DESIGN-SYSTEM.md</code> · brand brief: <code className="mono">docs/brand/brand-brief.md</code> · <Link href="/">back to the site</Link>.</p>
    </div>
  );
}

function Section({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="section-tight hairline-top" style={{ marginTop: 24 }}>
      <h2 className="h2" style={{ fontSize: 26 }}>{title}</h2>
      {sub && <p className="fine mt-1" style={{ maxWidth: 760 }}>{sub}</p>}
      <div className="mt-5 flex flex-col gap-3">{children}</div>
    </section>
  );
}
