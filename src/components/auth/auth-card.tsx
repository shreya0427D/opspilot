import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/logo";

const PRINCIPLES = [
  ["AI drafts", "Reads invoices and writes reminders"],
  ["Code verifies", "Amounts, dates and totals are checked"],
  ["You approve", "Nothing is sent without your say"],
];

/** Shared frame for sign-in, sign-up, email verification and onboarding. */
export function AuthCard({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Brand panel (desktop) */}
      <aside className="relative hidden overflow-hidden bg-lx-ink p-12 text-lx-porcelain lg:flex lg:flex-col">
        <div aria-hidden className="lx-guides-dark pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-24 top-1/3 size-96 rounded-full bg-lx-gold/10 blur-3xl" />
        <Link href="/" className="relative w-fit rounded-md focus-visible:outline-2 focus-visible:outline-lx-gold-light" aria-label="OpsPilot home">
          <Logo />
        </Link>
        <div className="relative mt-auto">
          <h2 className="font-display text-5xl leading-[1.02]">
            Less Manual Work.
            <br />
            <em className="text-lx-gold-light">More Room to Think.</em>
          </h2>
          <span aria-hidden className="mt-6 block h-[2px] w-16 bg-gradient-to-r from-lx-gold-deep via-lx-gold to-transparent" />
          <dl className="mt-10 grid grid-cols-3 border-t border-white/10">
            {PRINCIPLES.map(([k, v], i) => (
              <div key={k} className={`pt-4 pr-3 ${i ? "border-l border-white/10 pl-4" : ""}`}>
                <dt className="font-display text-lg">{k}</dt>
                <dd className="mt-1 text-xs leading-snug text-lx-mist">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>

      {/* Form */}
      <div className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <Link href="/" className="mb-8 rounded-md lg:hidden" aria-label="OpsPilot home">
          <Logo />
        </Link>
        <div className="relative w-full max-w-md overflow-hidden rounded-xl border border-border bg-card p-6 shadow-[0_30px_60px_-36px_rgba(23,34,48,.45)] sm:p-8">
          <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-lx-gold-deep via-lx-gold to-transparent" />
          <h1 className="font-display text-3xl leading-tight text-foreground">{title}</h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
