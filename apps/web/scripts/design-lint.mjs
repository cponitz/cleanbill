#!/usr/bin/env node
// Clean Bill design-system lint (SPEC-08 Part C, C8). No dependencies; run with `npm run lint:design` or from CI.
//   1. Under src/ (outside src/styles/), no hex colour literal, no rgb()/rgba()/hsl(), and no font-family with a literal
//      family name — colours and fonts are tokens (src/styles/tokens.css), read as var(--…).
//   2. Every theme file defines the same set of primitives, and every var(--…) referenced by tokens.css resolves in every
//      theme; every var(--…) used by globals.css and the JSX is a token tokens.css (or the theme) defines. This is the
//      "loads both theme files and asserts every semantic token resolves" test.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");
const src = join(root, "src");
const styles = join(src, "styles");
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---- 1. literals outside src/styles ------------------------------------------------------------------------------------
for (const file of walk(src)) {
  if (file.startsWith(styles + sep)) continue;
  const rel = relative(root, file);
  const text = strip(readFileSync(file, "utf8"));
  text.split("\n").forEach((line, i) => {
    const where = `${rel}:${i + 1}`;
    if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !/href=|url\(#|"#[a-z-]+"|'#[a-z-]+'|`#[a-z-]+`|\/#/.test(line)) problems.push(`${where}: hex colour literal — use a token`);
    if (/\b(rgba?|hsla?)\(/.test(line)) problems.push(`${where}: rgb()/hsl() literal — use a token`);
    const ff = line.match(/font-family\s*:\s*([^;}"']+)/);
    if (ff && !/^\s*(var\(--[a-z0-9-]+\)|inherit)\s*$/.test(ff[1])) problems.push(`${where}: font-family with a literal family — use var(--font-…)`);
    if (/fontFamily\s*:\s*["'`](?!var\()/.test(line)) problems.push(`${where}: fontFamily with a literal family — use var(--font-…)`);
  });
}

// ---- 2. tokens resolve in every theme ---------------------------------------------------------------------------------
const decls = (css) => Object.fromEntries([...strip(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const refs = (text) => new Set([...strip(text).matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]));
const tokens = decls(readFileSync(join(styles, "tokens.css"), "utf8"));
const themeFiles = readdirSync(styles).filter((f) => /^theme-[a-z]+\.css$/.test(f)).sort();
if (themeFiles.length < 2) problems.push("expected at least two theme files in src/styles/");
const themes = Object.fromEntries(themeFiles.map((f) => [f, decls(readFileSync(join(styles, f), "utf8"))]));
const runtimeFonts = new Set(["--font-dm", "--font-inter-tight", "--font-source-serif"]);   // set by next/font at runtime
const primitiveNames = new Set(Object.values(themes).flatMap((t) => Object.keys(t)));
for (const [file, t] of Object.entries(themes)) {
  for (const name of primitiveNames) if (!(name in t)) problems.push(`${file}: primitive ${name} is defined in another theme but not here`);
  const table = { ...t, ...tokens };
  const resolve1 = (name, seen = new Set()) => {
    if (runtimeFonts.has(name)) return true;
    if (!(name in table)) return false;
    if (seen.has(name)) return false;
    seen.add(name);
    return [...refs(table[name])].every((r) => resolve1(r, seen));
  };
  for (const name of Object.keys(tokens)) if (!resolve1(name)) problems.push(`${file}: semantic token ${name} does not resolve`);
}
const defined = new Set([...Object.keys(tokens), ...primitiveNames, ...runtimeFonts]);
for (const file of walk(src)) {
  if (file.startsWith(styles + sep)) continue;
  const rel = relative(root, file);
  for (const r of refs(readFileSync(file, "utf8"))) {
    if (!defined.has(r)) problems.push(`${rel}: var(${r}) is not a token`);
    else if (!(r in tokens) && !runtimeFonts.has(r)) problems.push(`${rel}: var(${r}) is a primitive — components read semantic tokens only`);
  }
}

if (problems.length) {
  console.error(`design lint: ${problems.length} problem(s)\n  ` + problems.join("\n  "));
  process.exit(1);
}
console.log(`design lint: ok (${themeFiles.length} themes, ${Object.keys(tokens).length} tokens, ${walk(src).length} files)`);
