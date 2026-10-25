import { cn } from "@/lib/utils";

/** Brand monogram: an ink tile with a gold "A" frame (the pilot's chevron). Shared by the landing page and the app. */
export function Monogram({ className = "size-7" }: { className?: string }) {
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-[6px] bg-lx-ink ring-1 ring-lx-gold/60", className)}>
      <svg viewBox="0 0 24 24" className="size-[60%]" fill="none" stroke="#d9be85" strokeWidth="2.2" aria-hidden>
        <path d="M4 18 L12 5 L20 18" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.2 13.5h7.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 font-semibold tracking-tight", className)}>
      <Monogram />
      {!compact && (
        <span>
          OpsPilot <span className="font-display text-lg font-normal italic text-lx-gold">AI</span>
        </span>
      )}
    </span>
  );
}
