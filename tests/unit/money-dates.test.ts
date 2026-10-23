import { describe, expect, it } from "vitest";
import { daysOverdue, isIsoDate, todayInZone } from "@/lib/domain/dates";
import {
  currencyExponent,
  formatMinor,
  isCurrencyCode,
  parseAmountToMinor,
  totalsByCurrency,
} from "@/lib/domain/money";

describe("money", () => {
  it("knows currency exponents", () => {
    expect(currencyExponent("USD")).toBe(2);
    expect(currencyExponent("INR")).toBe(2);
    expect(currencyExponent("JPY")).toBe(0);
  });

  it("parses common amount formats into minor units", () => {
    expect(parseAmountToMinor("1,234.50", "USD")).toBe(123450);
    expect(parseAmountToMinor("₹ 12,000", "INR")).toBe(1200000);
    expect(parseAmountToMinor("1234", "USD")).toBe(123400);
    expect(parseAmountToMinor("5000", "JPY")).toBe(5000);
    expect(parseAmountToMinor(19.99, "USD")).toBe(1999);
  });

  it("rejects ambiguous or invalid amounts instead of guessing", () => {
    expect(parseAmountToMinor("1.234,56", "EUR")).toBeNull();
    expect(parseAmountToMinor("-50", "USD")).toBeNull();
    expect(parseAmountToMinor("12.345", "USD")).toBeNull();
    expect(parseAmountToMinor("abc", "USD")).toBeNull();
    expect(parseAmountToMinor("12.5", "JPY")).toBeNull();
  });

  it("validates currency codes", () => {
    expect(isCurrencyCode("USD")).toBe(true);
    expect(isCurrencyCode("usd")).toBe(false);
    expect(isCurrencyCode("US")).toBe(false);
  });

  it("totals per currency without mixing", () => {
    const totals = totalsByCurrency(
      [
        { c: "USD", m: 100 },
        { c: "INR", m: 5000 },
        { c: "USD", m: 250 },
      ],
      (x) => ({ currency: x.c, minor: x.m }),
    );
    expect(totals).toEqual({ USD: 350, INR: 5000 });
  });

  it("formats minor units", () => {
    expect(formatMinor(123450, "USD")).toBe("$1,234.50");
  });
});

describe("dates", () => {
  it("validates real calendar dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("26-02-01")).toBe(false);
  });

  it("computes days overdue", () => {
    expect(daysOverdue("2026-10-01", "2026-10-23")).toBe(22);
    expect(daysOverdue("2026-10-23", "2026-10-23")).toBe(0);
    expect(daysOverdue("2026-10-30", "2026-10-23")).toBe(-7);
  });

  it("resolves today in a timezone", () => {
    const instant = new Date("2026-10-23T20:00:00Z");
    expect(todayInZone("Asia/Kolkata", instant)).toBe("2026-10-24");
    expect(todayInZone("America/New_York", instant)).toBe("2026-10-23");
  });
});
