import { CheckIcon, FileSearchIcon, MailCheckIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

const STEPS = [
  { icon: FileSearchIcon, title: "Reads your invoices", body: "Upload PDFs or photos. Fields are extracted, then checked by code: totals must add up and the client must match." },
  { icon: MailCheckIcon, title: "Drafts the follow-ups", body: "Friendly, firm or final, from your own templates. Amounts and dates are inserted from your records, never guessed." },
  { icon: ShieldCheckIcon, title: "Sends only what you approve", body: "Review the whole batch, edit anything, then send. The report shows what the email provider actually confirmed." },
];

export default function Home() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">Start free</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <section className="py-16 sm:py-24">
          <p className="mb-3 text-sm font-medium text-muted-foreground">For freelancers and independent consultants</p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Get paid for work you already did.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            OpsPilot finds overdue invoices, drafts the reminder emails you keep putting off, and sends them once you&apos;ve approved them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Create your workspace</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {["Free private beta", "Nothing sent without your approval", "Delete your data any time"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon className="size-4 text-success" /> {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-4 border-t py-12 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border p-5">
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <h2 className="mt-3 font-medium">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:px-6">
          <span>© {new Date().getFullYear()} OpsPilot</span>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
