import type { Browser, Page } from "@playwright/test";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export interface InvoiceSpec {
  id: string;
  number: string;
  client: string;
  email: string;
  issue: string;
  due: string;
  subtotal: string;
  gst: string;
  total: string;
  paidStamp?: boolean;
}

// Synthetic invoices mirroring sample_invoice_register.csv (the original files weren't provided).
export const REGISTER: InvoiceSpec[] = [
  { id: "T01", number: "OPS-QA-2026-001", client: "Northstar Design Studio", email: "billing@northstar-demo.example", issue: "2026-09-01", due: "2026-09-15", subtotal: "20,000.00", gst: "3,600.00", total: "23,600.00" },
  { id: "T02", number: "OPS-QA-2026-002", client: "Maple Grove Media", email: "accounts@maplegrove-demo.example", issue: "2026-09-20", due: "2026-10-10", subtotal: "10,000.00", gst: "1,800.00", total: "11,800.00" },
  { id: "T03", number: "OPS-QA-2026-003", client: "Redstone Studio", email: "finance@redstone-demo.example", issue: "2026-09-01", due: "2026-10-05", subtotal: "8,000.00", gst: "1,440.00", total: "9,440.00", paidStamp: true },
  { id: "T04", number: "OPS-QA-2026-004", client: "Blue Oak Consulting", email: "ap@blueoak-demo.example", issue: "2026-10-20", due: "2026-11-05", subtotal: "15,000.00", gst: "2,700.00", total: "17,700.00" },
  { id: "T05", number: "OPS-QA-2026-005", client: "Cedarline Works", email: "accounts@cedarline-demo.example", issue: "2026-09-25", due: "2026-10-12", subtotal: "10,000.00", gst: "1,800.00", total: "13,000.00" },
  { id: "T06", number: "OPS-QA-2026-006", client: "Silverline Analytics", email: "billing@silverline-demo.example", issue: "2026-09-30", due: "2026-10-15", subtotal: "7,500.00", gst: "1,350.00", total: "8,850.00" },
];

function lines(inv: InvoiceSpec) {
  return [
    `TAX INVOICE   No. ${inv.number}`,
    "From: QA Freelance Studio",
    `Bill To: ${inv.client}`,
    `Email: ${inv.email}`,
    `Invoice date: ${inv.issue}`,
    `Due date: ${inv.due}`,
    "Currency: INR",
    `Subtotal: ${inv.subtotal}`,
    `GST 18%: ${inv.gst}`,
    `Total due: ${inv.total}`,
  ];
}

export async function invoicePdf(inv: InvoiceSpec): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  lines(inv).forEach((t, i) => page.drawText(t, { x: 50, y: 780 - i * 24, size: 12, font }));
  if (inv.paidStamp) page.drawText("PAID", { x: 330, y: 520, size: 64, font: bold, color: rgb(0.8, 0.1, 0.1), rotate: degrees(20) });
  return Buffer.from(await pdf.save());
}

/** Renders the invoice as a slightly rotated "photo" PNG. */
export async function invoicePng(browser: Browser, inv: InvoiceSpec): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: 700, height: 600 } });
  await page.setContent(
    `<body style="margin:0;background:#d9d4c7;font-family:Arial"><div style="margin:30px;padding:30px;background:#fff;transform:rotate(-2deg);box-shadow:0 4px 14px #0004">${lines(inv)
      .map((l) => `<div style="font-size:18px;margin:6px 0">${l}</div>`)
      .join("")}</div></body>`,
  );
  const png = await page.screenshot();
  await page.close();
  return png;
}

/** Records CSP violations and console errors for the lifetime of a page. */
export async function watchPage(page: Page) {
  const problems: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp ??= [];
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} blocked ${e.blockedURI}`);
    });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy|Refused to/i.test(msg.text())) problems.push(`console: ${msg.text().slice(0, 200)}`);
  });
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message.slice(0, 200)}`));
  return {
    async collect() {
      const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => [] as string[]);
      return [...problems, ...csp.map((c) => `csp: ${c}`)];
    },
  };
}
