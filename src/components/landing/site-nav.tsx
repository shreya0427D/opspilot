"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_ROUTE, LOGIN_ROUTE, SECTIONS } from "./content";
import { Monogram } from "./ui";

const NAV_LINKS = [
  { href: "#workflow", index: "02", label: "How It Works" },
  { href: "#architecture", index: "03", label: "Architecture" },
  { href: "#product", index: "04", label: "Product" },
];

function useActiveSection() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [onDark, setOnDark] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(e.target.id);
            setOnDark((e.target as HTMLElement).dataset.tone === "dark");
          }
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);
  return { active, onDark };
}

export function SiteNav() {
  const { active, onDark } = useActiveSection();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dark = onDark && scrolled;
  const surface = !scrolled
    ? "border-transparent bg-transparent text-lx-ink"
    : dark
      ? "border-white/10 bg-lx-ink/85 text-lx-porcelain"
      : "border-lx-line bg-lx-porcelain/85 text-lx-ink";

  return (
    <>
      <header className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md transition-colors duration-300 ${surface}`}>
        <nav className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-5 sm:px-8" aria-label="Primary">
          <a href="#hero" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <Monogram />
            OpsPilot <span className="font-display text-lg font-normal italic text-lx-gold">AI</span>
          </a>
          <ul className="ml-8 hidden items-center gap-8 text-sm md:flex">
            {NAV_LINKS.map((l) => {
              const isActive = active === l.href.slice(1);
              return (
                <li key={l.href}>
                  <a
                    href={l.href}
                    aria-current={isActive ? "true" : undefined}
                    className={`group relative flex items-baseline gap-1.5 py-1 transition-opacity hover:opacity-100 ${isActive ? "opacity-100" : "opacity-70"}`}
                  >
                    <span className={`font-display text-xs ${dark ? "text-lx-gold-light" : "text-lx-gold-ink"}`}>{l.index}</span>
                    {l.label}
                    <span
                      aria-hidden
                      className={`absolute -bottom-0.5 left-0 h-px bg-lx-gold transition-all duration-300 ${isActive ? "w-full" : "w-0 group-hover:w-full"}`}
                    />
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link href={LOGIN_ROUTE} className="rounded-full px-4 py-2 text-sm opacity-75 transition-opacity hover:opacity-100">
              Sign in
            </Link>
            <Link
              href={APP_ROUTE}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-[transform,filter] hover:-translate-y-px ${dark ? "lx-gold" : "bg-lx-sapphire text-lx-porcelain hover:bg-lx-ink"}`}
            >
              Launch OpsPilot
            </Link>
          </div>
          <button
            type="button"
            className="ml-auto grid size-10 place-items-center rounded-full md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </button>
        </nav>
        {open && (
          <div id="mobile-menu" className="border-t border-lx-line bg-lx-porcelain px-5 pb-6 pt-2 text-lx-ink md:hidden">
            <ul className="flex flex-col divide-y divide-lx-line">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className="flex items-baseline gap-3 py-3.5 text-lg">
                    <span className="font-display text-sm text-lx-gold-ink">{l.index}</span>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-3">
              <Link href={LOGIN_ROUTE} className="flex-1 rounded-full border border-lx-sapphire/30 py-2.5 text-center text-lx-sapphire">
                Sign in
              </Link>
              <Link href={APP_ROUTE} className="lx-gold flex-1 rounded-full py-2.5 text-center font-semibold">
                Launch OpsPilot
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Five-chapter progress rail */}
      <nav aria-label="Page sections" className="fixed right-5 top-1/2 z-40 hidden -translate-y-1/2 lg:block">
        <ol className="flex flex-col gap-3">
          {SECTIONS.map((s, i) => {
            const isActive = active === s.id;
            return (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="group flex items-center justify-end gap-3"
                  aria-label={`${String(i + 1).padStart(2, "0")} ${s.label}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  <span
                    className={`text-[10px] uppercase tracking-[0.2em] opacity-0 transition-opacity group-hover:opacity-90 group-focus-visible:opacity-90 ${onDark ? "text-lx-mist" : "text-lx-muted"}`}
                  >
                    {String(i + 1).padStart(2, "0")} {s.label}
                  </span>
                  <span className={`block h-px transition-all duration-500 ${isActive ? "w-10 bg-lx-gold" : `w-5 ${onDark ? "bg-white/30" : "bg-lx-sapphire/30"}`}`} />
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
