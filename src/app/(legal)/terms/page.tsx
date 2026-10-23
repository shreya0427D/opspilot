import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms" };

// DRAFT — must be reviewed before real users are invited (launch blocker R3).
export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed">
      <Link href="/" className="text-muted-foreground hover:text-foreground">← OpsPilot</Link>
      <h1 className="mt-6 text-2xl font-semibold">Terms of use (draft)</h1>
      <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
        This is a draft for the private beta and has not been reviewed by a lawyer.
      </p>
      <ul className="mt-6 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>OpsPilot is a beta service provided as-is, free of charge, with daily usage limits.</li>
        <li>You are responsible for reviewing every email before approving it. OpsPilot never sends without your approval.</li>
        <li>Only upload documents and client details you are entitled to process.</li>
        <li>Extracted data can be wrong. Invoices that fail automatic checks are held for your review.</li>
      </ul>
    </main>
  );
}
