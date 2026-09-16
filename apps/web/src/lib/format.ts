/** Round DOWN to the nearest $100 and format — a homeowner is never shown an overstated refund (CLAUDE.md; estimator.conservative_display). */
export function moneyFloor(n: number | string | null | undefined, step = 100): string {
  const v = Math.floor(Number(n ?? 0) / step) * step;
  return "$" + v.toLocaleString("en-US");
}

/** 25% of a floored refund, itself rounded down to the dollar — the "fee if refunded in full" line (SPEC-07 §10). */
export function feeOn(n: number | string | null | undefined): string {
  const v = Math.floor(Number(n ?? 0) / 100) * 100;
  return "$" + Math.floor(v * 0.25).toLocaleString("en-US");
}

/** "2024 and 2025" · "2024, 2025 and 2026" · "2025" */
export function yearsText(years: number[]): string {
  const y = [...years].sort();
  if (y.length <= 1) return String(y[0] ?? "");
  return y.slice(0, -1).join(", ") + " and " + y[y.length - 1];
}

/** Sorted [year, total] pairs from leads.est_refund_by_year. */
export function byYear(m: Record<string, { total: number }> | null | undefined): Array<[number, number]> {
  return Object.entries(m ?? {}).map(([y, v]) => [Number(y), Number(v?.total ?? 0)] as [number, number]).sort((a, b) => a[0] - b[0]);
}

/** "Sep 4" — the portal's timeline dates (SPEC-07 §10). Null/invalid → "". */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** TCAD account shown as "0412xxxx": the first four digits, the rest masked (SPEC-07 §11 "masked account"). */
export function maskAccount(propId: number | string | null | undefined): string {
  const s = String(propId ?? "");
  if (s.length <= 4) return s;
  return s.slice(0, 4) + "x".repeat(s.length - 4);
}

/** "J. Rivera" from "RIVERA JORDAN" / "Jordan Rivera" — the owner of record, abbreviated for the confirm card. */
export function initials(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
