/** Display formatting helpers — pure, client-safe. */

export function compactNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000_000) return `${trim(n / 1_000_000_000)}B`;
  if (n >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `${trim(n / 1_000)}K`;
  return String(Math.round(n));
}

function trim(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

export function fullNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/** Engagement rates are stored as fractions (0.046 -> "4.6%"). */
export function percentFromFraction(
  f: number | null | undefined,
  digits = 1
): string {
  if (f == null) return "—";
  return `${(f * 100).toFixed(digits)}%`;
}

/** Already-percent values (0..1 implied-overlap -> "23%"). */
export function percent(f: number | null | undefined, digits = 0): string {
  if (f == null) return "—";
  return `${(f * 100).toFixed(digits)}%`;
}

export function usd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}
