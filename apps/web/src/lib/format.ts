/** Round DOWN to the nearest $100 and format — a homeowner is never shown an overstated refund (CLAUDE.md; estimator.conservative_display). */
export function moneyFloor(n: number | string | null | undefined, step = 100): string {
  const v = Math.floor(Number(n ?? 0) / step) * step;
  return "$" + v.toLocaleString("en-US");
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
