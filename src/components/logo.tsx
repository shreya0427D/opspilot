import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M4 17 L12 5 L20 17" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 13h8" strokeLinecap="round" />
        </svg>
      </span>
      {!compact && <span>OpsPilot</span>}
    </span>
  );
}
