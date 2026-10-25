"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "./nav";

/** Numbered eyebrow for the current area ("02 ── Invoices"), matching the landing page's sections. */
function AreaEyebrow() {
  const pathname = usePathname();
  const index = NAV.findIndex(({ href }) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href)));
  if (index < 0) return null;
  return (
    <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
      <span className="font-display text-sm tracking-normal text-lx-gold-ink">{String(index + 1).padStart(2, "0")}</span>
      <span className="h-px w-8 bg-lx-gold" />
      {NAV[index].label}
    </p>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <AreaEyebrow />
        <h1 className="mt-3 font-display text-[2rem] leading-[1.05] tracking-[-0.01em] break-words text-foreground sm:text-[2.5rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-input bg-card/60 px-6 py-14 text-center">
      <span aria-hidden className="mb-4 grid size-10 place-items-center rounded-full border border-lx-gold/50 text-lx-gold-ink">
        <span className="size-2 rotate-45 bg-lx-gold" />
      </span>
      <p className="font-display text-xl text-foreground">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 border-l-4 border-l-destructive bg-destructive/5 px-4 py-3 text-sm break-words text-destructive">
      Couldn&apos;t load this data: {message}
    </div>
  );
}
