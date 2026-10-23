import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

// DRAFT — must be reviewed before real users are invited (launch blocker R3).
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-sm leading-relaxed">
      <Link href="/" className="text-muted-foreground hover:text-foreground">← OpsPilot</Link>
      <h1 className="mt-6 text-2xl font-semibold">Privacy policy (draft)</h1>
      <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-warning">
        This is a draft for the private beta and has not been reviewed by a lawyer.
      </p>
      <h2 className="mt-6 font-medium">What we store</h2>
      <p className="mt-1 text-muted-foreground">
        Your account email, the workspace details you enter, the clients, invoices and payments you add or upload, uploaded files, and a
        history of tasks and actions taken on your behalf.
      </p>
      <h2 className="mt-6 font-medium">Who processes it</h2>
      <p className="mt-1 text-muted-foreground">
        Google Firebase/Google Cloud (hosting, database, file storage), Google Gemini API on a paid tier (document reading and drafting;
        under Google&apos;s paid-service terms, prompts are not used to improve Google&apos;s products), and Resend (sending the emails you approve).
      </p>
      <h2 className="mt-6 font-medium">Deletion</h2>
      <p className="mt-1 text-muted-foreground">
        You can delete your account from Settings at any time. This deletes your workspace, records, files and login.
      </p>
    </main>
  );
}
