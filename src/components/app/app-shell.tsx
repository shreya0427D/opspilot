"use client";

import { where } from "firebase/firestore";
import { LogOutIcon, MenuIcon, MoonIcon, SearchIcon, SunIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { useAuth, useWsPath } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
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
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              active && "bg-muted font-medium text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{label}</span>
            {href === "/app/approvals" && approvals.data.length > 0 && (
              <span className="rounded-full bg-warning/15 px-1.5 text-xs font-medium text-warning">{approvals.data.length}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <SunIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
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

  const sidebar = (
    <div className="flex h-full flex-col gap-4 p-3">
      <Link href="/app" className="px-1.5 pt-1" aria-label="Dashboard">
        <Logo />
      </Link>
      <NavLinks onNavigate={() => setMenuOpen(false)} />
      <div className="mt-auto space-y-2 border-t pt-3">
        <div className="px-1.5 text-xs">
          <div className="truncate font-medium">{workspace?.name ?? "…"}</div>
          <div className="truncate text-muted-foreground">{user.email}</div>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={signOut} className="ml-auto">
            <LogOutIcon /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r bg-sidebar lg:block">{sidebar}</aside>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          {sidebar}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <MenuIcon />
          </Button>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="flex h-8 w-full max-w-md items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-left text-sm text-muted-foreground hover:bg-muted"
          >
            <SearchIcon className="size-4" aria-hidden />
            <span className="flex-1 truncate">Tell OpsPilot what to do…</span>
            <kbd className="hidden rounded border bg-background px-1.5 text-[10px] font-medium sm:inline">Ctrl K</kbd>
          </button>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {dataError && (
            <div role="alert" className="mx-auto mb-6 max-w-6xl rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
              <p className="font-medium text-destructive">Your data can&apos;t be loaded.</p>
              <p className="mt-1 text-muted-foreground">
                {dataError === "permission-denied"
                  ? "The database refused access. This usually means the Firestore security rules haven't been deployed to this Firebase project yet (see README → Deploying)."
                  : dataError}
              </p>
            </div>
          )}
          {children}
        </main>
      </div>
      <CommandBar open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
