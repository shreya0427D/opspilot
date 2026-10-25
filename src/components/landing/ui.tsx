import type { ReactNode } from "react";

// Shared landing-page primitives for the Architect Ivory & Gold system.

/** Numbered section label: "02 ── How it works". */
export function Eyebrow({ index, label, dark }: { index: string; label: string; dark?: boolean }) {
  return (
    <p className={`flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.26em] ${dark ? "text-lx-mist" : "text-lx-muted"}`}>
      <span className={`font-display text-base tracking-normal ${dark ? "text-lx-gold-light" : "text-lx-gold-ink"}`}>{index}</span>
      <span className={`h-px w-10 ${dark ? "bg-lx-gold/50" : "bg-lx-gold"}`} />
      {label}
    </p>
  );
}

/** Editorial section heading with a brushed-gold rule underneath. */
export function SectionTitle({ id, children, dark }: { id: string; children: ReactNode; dark?: boolean }) {
  return (
    <div>
      <h2 id={id} className={`mt-5 font-display text-[clamp(2.6rem,5.4vw,4.5rem)] leading-[0.98] tracking-[-0.015em] ${dark ? "text-lx-porcelain" : "text-lx-ink"}`}>
        {children}
      </h2>
      <span aria-hidden className="mt-6 block h-[2px] w-16 bg-gradient-to-r from-lx-gold-deep via-lx-gold to-transparent" />
    </div>
  );
}

export function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Brand monogram: an ink tile with a gold "A" frame (the pilot's chevron). */
export function Monogram({ className = "size-7" }: { className?: string }) {
  return (
    <span className={`grid place-items-center rounded-[6px] bg-lx-ink ring-1 ring-lx-gold/60 ${className}`}>
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="#d9be85" strokeWidth="2.2" aria-hidden>
        <path d="M4 18 L12 5 L20 18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.2 13.5h7.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export const BTN_PRIMARY =
  "lx-gold inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-[transform,filter] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lx-gold-deep";
export const BTN_SECONDARY =
  "inline-flex items-center gap-2 rounded-full border border-lx-sapphire/30 px-6 py-3 text-sm font-medium text-lx-sapphire transition-colors hover:border-lx-sapphire hover:bg-lx-sapphire hover:text-lx-porcelain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lx-sapphire";
