import { daysOverdue, todayInZone } from "@/lib/domain/dates";
import { formatMinor } from "@/lib/domain/money";
import type { Invoice } from "@/lib/domain/types";

export const money = (minor: number | null | undefined, currency: string | null | undefined) =>
  minor === null || minor === undefined || !currency ? "—" : formatMinor(minor, currency);

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatTime(ms: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function relativeTime(ms: number | null) {
  if (!ms) return "";
  const diff = Math.round((ms - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** Display status for an invoice, including "overdue" which is derived, not stored. */
export function invoiceDisplayStatus(inv: Invoice, timezone: string): string {
  if (inv.reviewStatus === "needs_review") return "needs_review";
  if ((inv.status === "open" || inv.status === "partially_paid") && inv.dueDate && daysOverdue(inv.dueDate, todayInZone(timezone)) > 0) {
    return "overdue";
  }
  return inv.status;
}

export const outstandingOf = (inv: Pick<Invoice, "totalMinor" | "paidMinor">) => Math.max(0, (inv.totalMinor ?? 0) - inv.paidMinor);
