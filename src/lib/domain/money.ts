// Money is always stored as an integer count of the currency's minor unit (cents, paise, yen).
// Never do arithmetic on decimal strings or floats.

const exponentCache = new Map<string, number>();

export function isCurrencyCode(code: string): boolean {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code });
    return true;
  } catch {
    return false;
  }
}

export function currencyExponent(currency: string): number {
  const cached = exponentCache.get(currency);
  if (cached !== undefined) return cached;
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  exponentCache.set(currency, digits);
  return digits;
}

/**
 * Parses a human/extracted amount ("1,234.50", "₹ 12,000", "1234") into minor units.
 * Returns null when the value is ambiguous or not a valid amount.
 */
export function parseAmountToMinor(input: string | number, currency: string): number | null {
  const exp = currencyExponent(currency);
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) return null;
    return Math.round(input * 10 ** exp);
  }
  const cleaned = input.replace(/[^\d.,-]/g, "").trim();
  if (!cleaned || cleaned.startsWith("-")) return null;
  // Accept "1,234.56" (comma thousands). Reject "1.234,56" style to avoid silent misreads.
  if (!/^\d{1,3}(,\d{2,3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.replace(/,/g, "").split(".");
  if (frac.length > exp) return null;
  return Number(whole) * 10 ** exp + Number(frac.padEnd(exp, "0") || 0);
}

export function formatMinor(minor: number, currency: string, locale = "en"): string {
  const exp = currencyExponent(currency);
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(minor / 10 ** exp);
}

/** Sums amounts per currency. Different currencies are never converted or combined. */
export function totalsByCurrency<T>(
  items: T[],
  pick: (item: T) => { currency: string; minor: number },
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const item of items) {
    const { currency, minor } = pick(item);
    totals[currency] = (totals[currency] ?? 0) + minor;
  }
  return totals;
}
