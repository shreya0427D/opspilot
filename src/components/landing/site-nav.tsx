"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_ROUTE, LOGIN_ROUTE, SECTIONS } from "./content";

const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#workflow", label: "How It Works" },
  { href: "#architecture", label: "Architecture" },
];

function useActiveSection() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [onDark, setOnDark] = useState(true);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setActive(e.target.id);
            setOnDark((e.target as HTMLElement).dataset.tone !== "light");
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

  const tone = onDark
    ? "text-[#e9ecf5] border-white/10 bg-[#070b16]/70"
    : "text-[#141a2b] border-[#141a2b]/10 bg-[#f4efe6]/80";

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md transition-colors duration-200 ${scrolled ? tone : "border-transparent bg-transparent text-[#e9ecf5]"}`}
      >
        <nav className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-5 sm:px-8" aria-label="Primary">
          <a href="#hero" className="flex items-center gap-2.5 font-semibold tracking-tight">
            <span className="grid size-7 place-items-center rounded-[7px] bg-current">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke={onDark || !scrolled ? "#070b16" : "#f4efe6"} strokeWidth="2.4" aria-hidden>
                <path d="M4 17 L12 5 L20 17" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M8 13h8" strokeLinecap="round" />
              </svg>
            </span>
            OpsPilot AI
          </a>
          <ul className="ml-6 hidden items-center gap-7 text-sm md:flex">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className={`transition-opacity hover:opacity-100 ${active === l.href.slice(1) ? "opacity-100" : "opacity-65"}`}
                  aria-current={active === l.href.slice(1) ? "true" : undefined}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Link href={LOGIN_ROUTE} className="rounded-full px-4 py-2 text-sm opacity-80 transition-opacity hover:opacity-100">
              Sign in
            </Link>
            <Link href={APP_ROUTE} className="rounded-full bg-[#f2a83b] px-4 py-2 text-sm font-semibold text-[#1b1305] transition-transform hover:-translate-y-px">
              Launch App
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
          <div id="mobile-menu" className="border-t border-white/10 bg-[#070b16] px-5 pb-6 pt-2 text-[#e9ecf5] md:hidden">
            <ul className="flex flex-col">
              {NAV_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setOpen(false)} className="block py-3 text-lg">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-3">
              <Link href={LOGIN_ROUTE} className="flex-1 rounded-full border border-white/20 py-2.5 text-center">
                Sign in
              </Link>
              <Link href={APP_ROUTE} className="flex-1 rounded-full bg-[#f2a83b] py-2.5 text-center font-semibold text-[#1b1305]">
                Launch App
              </Link>
            </div>
          </div>
        )}
      </header>

      {/* Five-chapter progress indicator */}
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
                    className={`text-[11px] tracking-[0.18em] uppercase transition-opacity opacity-0 group-hover:opacity-80 group-focus-visible:opacity-80 ${onDark ? "text-[#e9ecf5]" : "text-[#141a2b]"}`}
                  >
                    {String(i + 1).padStart(2, "0")} {s.label}
                  </span>
                  <span
                    className={`block h-px transition-all duration-500 ${isActive ? "w-10 bg-[#f2a83b]" : `w-5 ${onDark ? "bg-white/35" : "bg-[#141a2b]/30"}`}`}
                  />
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
