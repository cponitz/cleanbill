// Applies the design-system theme before first paint (SPEC-08 Part C, C2). The default is `DEFAULT_THEME` in
// layout.tsx (rendered as `data-theme` on <html>); `?theme=handoff|brief` on any URL, or the toggle on /design-system,
// overrides it for this browser (localStorage `cb-theme`) so the whole site can be reviewed in either palette without a
// deploy. No theme name here is a colour: the values live in src/styles/theme-*.css.
export const THEMES = ["handoff", "brief"] as const;
export type ThemeName = (typeof THEMES)[number];
export const THEME_KEY = "cb-theme";

const script = `(function(){try{var t=new URLSearchParams(location.search).get("theme");var k="${THEME_KEY}";var ok=${JSON.stringify(THEMES)};
if(t&&ok.indexOf(t)>=0){localStorage.setItem(k,t)}else{t=localStorage.getItem(k)}
if(t&&ok.indexOf(t)>=0){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
