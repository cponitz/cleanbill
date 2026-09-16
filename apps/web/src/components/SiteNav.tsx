"use client";
// SPEC-07 nav: logo · Homeowners ▾ (How it works, Homestead refunds, Exemptions, Appeals) · Businesses · Pricing · FAQ ·
// About · Sign in · Get started. Under 768px: logo + a two-line menu button; the links and "Get started" live in a sheet
// that slides in from the right (250 ms). The portal variant swaps the links for the four section tabs and an avatar.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV } from "@/lib/site";
import { PORTAL } from "@/lib/copy";
import { Logo } from "./ui";

const HOMEOWNER_PATHS = new Set(["/", "/how-it-works", "/exemptions", "/appeals"]);

export function SiteNav({ portal }: { portal?: { initials: string; name: string | null } }) {
  const path = usePathname() ?? "/";
  // Both menus remember the path they were opened on, so a navigation closes them without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const open = openAt === path, menu = menuAt === path;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((typeof v === "function" ? v(open) : v) ? path : null);
  const setMenu = (v: boolean | ((o: boolean) => boolean)) => setMenuAt((typeof v === "function" ? v(menu) : v) ? path : null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuAt(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuAt(null); setOpenAt(null); } };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [menu]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);

  const current = (href: string) => (href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined;

  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Logo />
        {portal ? (
          <>
            <nav className="nav-links portal-tabs" aria-label="Your claim">
              {PORTAL.tabs.map(([t, href], i) => <a key={t} href={href} className={i === 0 ? "active" : ""}>{t}</a>)}
            </nav>
            <div className="nav-right" style={{ gap: 10 }}>
              <span className="avatar" aria-hidden="true">{portal.initials || "•"}</span>
              {portal.name && <span className="text-[15px] font-medium text-body">{portal.name}</span>}
            </div>
            <span className="avatar md:hidden" aria-hidden="true">{portal.initials || "•"}</span>
          </>
        ) : (
          <>
            <nav className="nav-links" aria-label="Main">
              <div className="relative" ref={menuRef}>
                <button type="button" className={`nav-link ${HOMEOWNER_PATHS.has(path) ? "active" : ""}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} onMouseEnter={() => setMenu(true)}>
                  {NAV.homeowners} <span aria-hidden="true" className="text-[11px]">▾</span>
                </button>
                {menu && (
                  <div className="nav-menu" role="menu" onMouseLeave={() => setMenu(false)}>
                    {NAV.homeownersMenu.map(([t, href]) => <Link key={href} href={href} role="menuitem">{t}</Link>)}
                  </div>
                )}
              </div>
              {NAV.links.map(([t, href]) => <Link key={href} href={href} className="nav-link" aria-current={current(href)}>{t}</Link>)}
            </nav>
            <div className="nav-right">
              <Link href="/claim" className="nav-link">{NAV.signIn}</Link>
              <Link href="/#start" className="btn btn-outline">{NAV.getStarted}</Link>
            </div>
            <button type="button" className="nav-burger" aria-label={open ? NAV.close : NAV.menu} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
              <span /><span />
            </button>
          </>
        )}
      </div>
      {!portal && (
        <div id="mobile-menu" className="nav-sheet" data-open={open} aria-hidden={!open}>
          <div className="nav-sheet-bg" onClick={() => setOpen(false)} />
          <div className="nav-sheet-panel" role="dialog" aria-label={NAV.menu}>
            <div className="flex items-center justify-between pb-2">
              <Logo />
              <button type="button" className="nav-burger" style={{ display: "flex" }} aria-label={NAV.close} onClick={() => setOpen(false)}><span style={{ transform: "rotate(45deg) translate(3px,3px)" }} /><span style={{ transform: "rotate(-45deg) translate(3px,-3px)" }} /></button>
            </div>
            <div className="nav-group">{NAV.homeowners}</div>
            {NAV.homeownersMenu.map(([t, href]) => <Link key={href} href={href} className="nav-sub">{t}</Link>)}
            {NAV.links.map(([t, href]) => <Link key={href} href={href}>{t}</Link>)}
            <Link href="/claim">{NAV.signIn}</Link>
            <Link href="/#start" className="btn btn-l btn-block mt-4" style={{ color: "#fff" }}>{NAV.getStarted}</Link>
          </div>
        </div>
      )}
      {portal && (
        <div className="wrap md:hidden">
          <nav className="portal-tabs" aria-label="Your claim">
            {PORTAL.tabs.map(([t, href], i) => <a key={t} href={href} className={i === 0 ? "active" : ""}>{t}</a>)}
          </nav>
        </div>
      )}
    </header>
  );
}
