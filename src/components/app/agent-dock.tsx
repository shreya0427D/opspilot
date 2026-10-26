"use client";

import { limit, orderBy } from "firebase/firestore";
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useWsPath } from "@/components/providers/auth-provider";
import { toMillis, useLiveCollection } from "@/lib/client/firestore-hooks";
import type { Task, TaskStatus } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

// The workspace's AI agent: a small robot "orb" that shows what the agent is genuinely doing.
// Every state below comes from real data — the command being submitted, or the latest task's
// status in Firestore. Nothing here simulates progress.

export type AgentState = "idle" | "thinking" | "working" | "waiting" | "done" | "failed";

const ACTIVE: Partial<Record<TaskStatus, AgentState>> = {
  queued: "thinking",
  planning: "thinking",
  running: "working",
  waiting_on_model: "working",
  awaiting_approval: "waiting",
  awaiting_input: "waiting",
};
const FINISHED: Partial<Record<TaskStatus, AgentState>> = {
  succeeded: "done",
  partially_succeeded: "failed",
  failed: "failed",
};
/** Finished tasks stay on the agent's status line this long. */
const RECENT_MS = 15 * 60 * 1000;

const LABEL: Record<AgentState, string> = {
  idle: "Ready when you are",
  thinking: "Planning",
  working: "Working",
  waiting: "Needs your approval",
  done: "Finished",
  failed: "Couldn't finish",
};

/** The robot face. `state` drives its eyes and ring; all motion stops under reduced motion. */
export function AgentOrb({ state = "idle", size = 44, className }: { state?: AgentState; size?: number; className?: string }) {
  const happy = state === "done";
  const uid = useId().replace(/:/g, "");
  return (
    <span data-state={state} className={cn("agent-orb relative inline-grid shrink-0 place-items-center rounded-full", className)} style={{ width: size, height: size }} aria-hidden>
      {/* champagne ring */}
      <span className="agent-ring absolute inset-0 rounded-full" />
      <span className="agent-glow absolute -inset-1 rounded-full" />
      <svg viewBox="0 0 48 48" className="agent-face relative size-[86%]">
        <defs>
          <radialGradient id={`agent-shell-${uid}`} cx="35%" cy="28%" r="80%">
            <stop offset="0" stopColor="#33496a" />
            <stop offset=".55" stopColor="#1d2b3e" />
            <stop offset="1" stopColor="#111a26" />
          </radialGradient>
          <linearGradient id={`agent-visor-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0d141e" />
            <stop offset="1" stopColor="#18263a" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="23" fill={`url(#agent-shell-${uid})`} />
        <path d="M9 17 A 17 17 0 0 1 22 8" stroke="#fffcf6" strokeOpacity=".18" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        {/* side "ears" */}
        <rect x="3.5" y="21" width="3" height="7" rx="1.5" fill="#b89150" />
        <rect x="41.5" y="21" width="3" height="7" rx="1.5" fill="#b89150" />
        {/* visor */}
        <rect x="10" y="16.5" width="28" height="15" rx="7.5" fill={`url(#agent-visor-${uid})`} stroke="#b89150" strokeOpacity=".55" strokeWidth=".8" />
        <g className="agent-eyes">
          {happy ? (
            <>
              <path d="M15.5 25.5 q3 -4 6 0" className="agent-eye-stroke" />
              <path d="M26.5 25.5 q3 -4 6 0" className="agent-eye-stroke" />
            </>
          ) : (
            <>
              <rect className="agent-eye" x="16" y="20.5" width="5" height="7" rx="2.5" />
              <rect className="agent-eye" x="27" y="20.5" width="5" height="7" rx="2.5" />
            </>
          )}
        </g>
        {/* mouth line */}
        <rect x="21" y="35" width="6" height="1.6" rx=".8" fill="#b89150" fillOpacity=".7" />
      </svg>
    </span>
  );
}

/** The latest task's status, if it is still relevant (in progress, or finished recently). */
function useAgentActivity() {
  const tasks = useLiveCollection<Task>(useWsPath("tasks"), [orderBy("createdAt", "desc"), limit(1)], "agent-latest");
  // Refreshed each minute so a finished task drops off the status line on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const task = tasks.data[0];
  if (!task) return null;
  const active = ACTIVE[task.status];
  if (active) return { state: active, task };
  const finished = FINISHED[task.status];
  const at = toMillis(task.finishedAt ?? task.updatedAt);
  if (finished && at && now - at < RECENT_MS) return { state: finished, task };
  return null;
}

/** Header dock: opens the command dialog and shows what the agent is actually doing. */
export function AgentDock({ onOpen, submitting }: { onOpen: () => void; submitting: boolean }) {
  const activity = useAgentActivity();
  const state: AgentState = submitting ? "thinking" : (activity?.state ?? "idle");
  const status = submitting ? "Sending your request…" : activity ? `${LABEL[activity.state]} · ${activity.task.command}` : LABEL.idle;

  return (
    <div data-state={state} className="agent-dock group/dock relative flex h-14 w-full max-w-xl items-center gap-1 rounded-full bg-lx-ink py-1.5 pr-2 pl-1.5 text-lx-porcelain ring-1 ring-lx-gold/35">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-full py-0.5 pr-2 pl-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-lx-gold-light"
        aria-label="Ask your agent to get things done (Ctrl K)"
      >
        <AgentOrb state={state} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[1.05rem] leading-tight">
            Ask your agent <span className="hidden italic text-lx-gold-light sm:inline">to get things done</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-lx-mist" aria-live="polite">
            <span className={cn("agent-status-dot size-1.5 shrink-0 rounded-full", state === "failed" ? "bg-[#e08a7e]" : state === "idle" ? "bg-[#8cc3a0]" : "bg-lx-gold-light")} />
            <span className="truncate">{status}</span>
          </span>
        </span>
        <kbd className="hidden shrink-0 rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-medium text-lx-mist md:inline">Ctrl K</kbd>
      </button>
      {activity && !submitting && (
        <Link
          href={`/app/tasks/${activity.task.id}`}
          className="hidden shrink-0 items-center gap-1 rounded-full border border-lx-gold/40 px-2.5 py-1 text-[11px] font-medium text-lx-gold-light transition-colors hover:bg-lx-gold/15 focus-visible:outline-2 focus-visible:outline-lx-gold-light sm:inline-flex"
        >
          {activity.state === "waiting" ? "Review" : "View"} <ArrowUpRightIcon className="size-3" />
        </Link>
      )}
    </div>
  );
}
