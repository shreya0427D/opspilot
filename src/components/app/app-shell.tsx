"use client";

import { where } from "firebase/firestore";
import { LogOutIcon, MenuIcon, SettingsIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveCollection } from "@/lib/client/firestore-hooks";
import { cn } from "@/lib/utils";
import { CommandBar } from "./command-bar";
import { NAV } from "./nav";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const approvals = useLiveCollection(useWsPath("approvals"), [where("status", "==", "pending")], "pending");
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon }, i) => {
        const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        const pending = href === "/app/approvals" ? approvals.data.length : 0;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-[#b9c4d2] transition-colors hover:bg-white/[0.05] hover:text-[#fffcf6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d9be85]",
              active && "bg-sidebar-accent font-medium text-[#fffcf6]",
            )}
          >
            <span aria-hidden className={cn("absolute inset-y-2 left-0 w-[2px] rounded-full transition-colors", active ? "bg-[#b89150]" : "bg-transparent")} />
            <Icon className={cn("size-4 shrink-0", active ? "text-[#d9be85]" : "text-[#8fa3bc] group-hover:text-[#d9be85]")} aria-hidden />
            <span className="flex-1">{label}</span>
            {pending > 0 ? (
              <span className="rounded-full bg-[#b89150] px-1.5 text-[11px] font-semibold leading-5 text-[#172230]" aria-label={`${pending} pending`}>
                {pending}
              </span>
            ) : (
              <span aria-hidden className="font-display text-xs text-[#5f7189]">{String(i + 1).padStart(2, "0")}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, workspace, dataError, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  // Server session exists but the browser lost its Firebase sign-in: start over cleanly.
  useEffect(() => {
    if (ready && !user) void signOut();
  }, [ready, user, signOut]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!ready || !user) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-6 w-40" />
      </div>
    );
  }

  const initial = (workspace?.name || user.email || "?").trim().charAt(0).toUpperCase();

  const sidebar = (
    <div className="flex min-h-full flex-col gap-6 px-3 pb-4 pt-5 text-sidebar-foreground">
      <Link href="/app" className="rounded-md px-2 focus-visible:outline-2 focus-visible:outline-[#d9be85]" aria-label="Dashboard">
        <Logo className="text-[#fffcf6]" />
      </Link>
      <div>
        <p className="mb-2 flex items-center gap-2 px-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[#8fa3bc]">
          Workspace <span className="h-px flex-1 bg-white/10" />
        </p>
        <NavLinks onNavigate={() => setMenuOpen(false)} />
      </div>
      <div className="mt-auto space-y-3 border-t border-sidebar-border pt-4">
        <div className="flex items-center gap-3 px-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#24354b] text-sm font-semibold text-[#d9be85] ring-1 ring-[#b89150]/40">{initial}</span>
          <div className="min-w-0 text-xs">
            <div className="truncate font-medium text-[#fffcf6]" title={workspace?.name}>{workspace?.name ?? "…"}</div>
            <div className="truncate text-[#b9c4d2]" title={user.email ?? undefined}>{user.email}</div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-[#b9c4d2] hover:bg-white/[0.06] hover:text-[#fffcf6]"
        >
          <LogOutIcon /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar lg:block">{sidebar}</aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] overflow-y-auto border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&_[data-slot=sheet-close]]:text-[#fffcf6]">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-[#fffcf6]/90 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
              <MenuIcon />
            </Button>
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="group flex h-10 w-full max-w-xl items-center gap-2.5 rounded-full border border-input bg-card px-4 text-left text-sm text-muted-foreground shadow-[inset_0_1px_2px_rgba(23,34,48,.05)] transition-colors hover:border-[#b89150] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <SparklesIcon className="size-4 shrink-0 text-[#8a6a35]" aria-hidden />
              <span className="flex-1 truncate">Tell OpsPilot what to do…</span>
              <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70 sm:inline">Ctrl K</kbd>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="ml-auto grid size-9 shrink-0 place-items-center rounded-full bg-[#172230] text-sm font-semibold text-[#d9be85] ring-1 ring-[#b89150]/50 transition-shadow hover:ring-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:ring-2"
                aria-label="Account menu"
              >
                {initial}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-64 border-t-2 border-t-[#b89150] p-1.5">
                <DropdownMenuLabel className="px-2 py-1.5">
                  <div className="truncate text-sm font-medium text-foreground" title={workspace?.name}>{workspace?.name ?? "Workspace"}</div>
                  <div className="truncate text-xs font-normal text-muted-foreground" title={user.email ?? undefined}>{user.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/settings">
                    <SettingsIcon /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void signOut()}>
                  <LogOutIcon /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-10">
          {dataError && (
            <div role="alert" className="mx-auto mb-6 max-w-6xl rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">Your data can&apos;t be loaded.</p>
              <p className="mt-1 text-muted-foreground">
                {dataError === "permission-denied"
                  ? "The database refused access. This usually means the Firestore security rules haven't been deployed to this Firebase project yet (see README → Deploying)."
                  : dataError === "unreachable"
                    ? "The database isn't responding. Check your internet connection; some VPNs, proxies or antivirus tools block it."
                    : dataError}
              </p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => window.location.reload()}>
                Try again
              </Button>
            </div>
          )}
          {children}
        </main>
      </div>
      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
