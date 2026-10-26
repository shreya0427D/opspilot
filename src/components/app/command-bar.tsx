"use client";

import { CornerDownLeftIcon, SparklesIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { api, errorMessage } from "@/lib/client/api";
import { AgentOrb } from "./agent-dock";
import { NAV } from "./nav";

const SUGGESTIONS = [
  "Chase all overdue invoices",
  "What's overdue right now?",
  "Remind Northwind Studio about their unpaid invoices",
  "Look up client Lumen Analytics",
];

export function useRunCommand() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(command: string) {
    const text = command.trim();
    if (!text || busy) return false;
    setBusy(true);
    try {
      // A fresh key per submission; the server dedupes double-clicks and retries on it.
      const { taskId } = await api<{ taskId: string }>("/api/tasks", {
        body: { command: text, submissionKey: crypto.randomUUID() },
      });
      router.push(`/app/tasks/${taskId}`);
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { run, busy };
}

export function CommandBar({
  open,
  onOpenChange,
  onBusyChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Reports the real submission state so the header agent can show it. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const { run, busy } = useRunCommand();
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);

  async function submit(command: string) {
    if (await run(command)) {
      setText("");
      onOpenChange(false);
    }
  }

  const q = text.toLowerCase();
  const pages = NAV.filter((n) => !q || n.label.toLowerCase().includes(q));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command bar" description="Tell OpsPilot what to do or jump to a page">
      <Command shouldFilter={false}>
        <div className="flex items-center gap-3 border-b border-border bg-lx-ink px-4 py-3 text-lx-porcelain">
          <AgentOrb state={busy ? "thinking" : "idle"} size={40} />
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight">Ask your agent <span className="italic text-lx-gold-light">to get things done</span></p>
            <p className="text-xs text-lx-mist" aria-live="polite">{busy ? "Sending your request…" : "Describe the task in plain words, or jump to a page."}</p>
          </div>
        </div>
        <CommandInput
          placeholder="e.g. Chase overdue invoices for Acme"
          value={text}
          onValueChange={setText}
          disabled={busy}
          maxLength={2000}
        />
        <CommandList>
          {text.trim() && (
            <CommandGroup heading="Run">
              <CommandItem value={`run:${text}`} onSelect={() => submit(text)}>
                <SparklesIcon />
                <span className="flex-1 truncate">{text}</span>
                <CornerDownLeftIcon className="opacity-60" />
              </CommandItem>
            </CommandGroup>
          )}
          {!text.trim() && (
            <CommandGroup heading="Try">
              {SUGGESTIONS.map((s) => (
                <CommandItem key={s} value={s} onSelect={() => setText(s)}>
                  <SparklesIcon />
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandSeparator />
          {pages.length > 0 && (
            <CommandGroup heading="Go to">
              {pages.map(({ href, label, icon: Icon }) => (
                <CommandItem
                  key={href}
                  value={`nav:${href}`}
                  onSelect={() => {
                    onOpenChange(false);
                    router.push(href);
                  }}
                >
                  <Icon />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          OpsPilot plans the work and drafts emails. Nothing is sent until you approve it.
        </p>
      </Command>
    </CommandDialog>
  );
}
