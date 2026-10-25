import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { Agents } from "@/components/landing/agents";
import { APP_ROUTE, GITHUB_URL, LOGIN_ROUTE } from "@/components/landing/content";
import { HeroVisual } from "@/components/landing/hero-visual";
import { Product } from "@/components/landing/product";
import { SiteNav } from "@/components/landing/site-nav";
import { BTN_PRIMARY, BTN_SECONDARY, Eyebrow, GitHubMark, Monogram, SectionTitle } from "@/components/landing/ui";
import { Workflow } from "@/components/landing/workflow";

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif-display" });

export const metadata: Metadata = {
  title: "OpsPilot AI — Less manual work. More room to think.",
  description: "An intelligent operations workspace for invoices, clients, payment reminders, and business workflows — with you approving every action.",
};

/** The three commitments the product is built on (design principles, not metrics). */
const PRINCIPLES = [
  ["AI drafts", "Reads invoices and writes reminders"],
  ["Code verifies", "Amounts, dates and totals are checked"],
  ["You approve", "Nothing is sent without your say"],
];

/** Section 05 artwork: the document, workflow path, agent nodes and console resolve into one system. */
function FinaleArt() {
  return (
    <svg viewBox="0 0 640 440" className="w-full" role="img" aria-label="An invoice, the workflow path, agent nodes and the console joined into one completed system">
      <defs>
        <linearGradient id="fa-console" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2c4160" />
          <stop offset="1" stopColor="#172230" />
        </linearGradient>
        <linearGradient id="fa-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d6ba80" />
          <stop offset=".5" stopColor="#b89150" />
          <stop offset="1" stopColor="#8a6a35" />
        </linearGradient>
        <pattern id="fa-grid" width="32" height="32" patternUnits="userSpaceOnUse">
          <path d="M32 0H0V32" fill="none" stroke="#24354b" strokeOpacity=".07" />
        </pattern>
      </defs>
      <rect width="640" height="440" fill="url(#fa-grid)" />
      {/* architectural datum lines */}
      <path d="M0 330 H640 M120 0 V440" stroke="#b89150" strokeOpacity=".35" strokeDasharray="2 6" />
      <ellipse className="finale-glow" cx="340" cy="250" rx="250" ry="120" fill="#b89150" fillOpacity=".08" />
      {/* path from document → nodes → console → completion */}
      <path className="finale-line" style={{ ["--len" as string]: 780 }} d="M150 260 C 190 260, 190 160, 240 160 S 310 120, 340 150 S 430 250, 540 200" fill="none" stroke="url(#fa-gold)" strokeWidth="2.5" strokeLinecap="round" />
      {/* document */}
      <g transform="translate(64 196) rotate(-6)">
        <rect x="6" y="8" width="96" height="124" rx="2" fill="#24354b" fillOpacity=".12" />
        <rect width="96" height="124" rx="2" fill="#fffcf6" stroke="#ddd3c1" />
        <rect x="12" y="16" width="44" height="7" fill="#172230" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="12" y={36 + i * 14} width={i % 2 ? 48 : 68} height="4" fill="#ddd3c1" />
        ))}
        <rect x="12" y="100" width="72" height="1.5" fill="#b89150" />
      </g>
      {/* agent nodes */}
      {[
        [240, 160],
        [340, 150],
      ].map(([x, y], i) => (
        <g key={i}>
          <polygon points={`${x - 24},${y + 4} ${x - 12},${y + 15} ${x + 12},${y + 15} ${x + 24},${y + 4}`} fill="#172230" />
          <polygon points={`${x - 24},${y} ${x - 12},${y - 11} ${x + 12},${y - 11} ${x + 24},${y} ${x + 12},${y + 11} ${x - 12},${y + 11}`} fill="#24354b" stroke="#d9be85" strokeWidth="1.2" />
          <circle className="finale-node" cx={x} cy={y} r="3.5" fill="#d9be85" />
        </g>
      ))}
      {/* console */}
      <rect x="392" y="182" width="200" height="132" rx="8" fill="url(#fa-console)" />
      <rect x="400" y="190" width="184" height="116" rx="4" fill="#172230" stroke="#2e425a" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="414" cy={210 + i * 22} r="5" fill={i < 2 ? "#8cc3a0" : "#d9be85"} />
          <rect x="426" y={207 + i * 22} width={110 - i * 18} height="6" rx="3" fill="#2e425a" />
        </g>
      ))}
      <rect x="412" y="276" width="96" height="18" rx="9" fill="#b89150" fillOpacity=".18" stroke="#b89150" strokeOpacity=".5" />
      <text x="460" y="289" textAnchor="middle" fontSize="10" fill="#d9be85" fontFamily="system-ui" letterSpacing=".5">Complete</text>
      <rect x="470" y="314" width="44" height="14" fill="#24354b" />
      <rect x="440" y="328" width="104" height="5" rx="2.5" fill="#172230" />
      {/* completion seal */}
      <g transform="translate(572 160)">
        <circle r="30" fill="url(#fa-gold)" />
        <circle r="24" fill="none" stroke="#fffcf6" strokeOpacity=".55" />
        <path d="M-10 0 l7 7 l14 -15" stroke="#172230" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="120" y="420" fontSize="10" fill="#82796c" fontFamily="system-ui" letterSpacing="2">FIG. 05 — DOCUMENT TO DONE</text>
    </svg>
  );
}

export default function Home() {
  return (
    <div className={`landing-root ${display.variable} min-h-svh bg-lx-ivory font-sans text-lx-ink antialiased selection:bg-lx-gold/30`}>
      <a href="#workflow" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-[60] focus:rounded-md focus:bg-lx-ink focus:px-3 focus:py-2 focus:text-lx-porcelain">
        Skip to content
      </a>
      <SiteNav />

      <main>
        {/* 01 — HERO */}
        <section id="hero" data-tone="light" aria-labelledby="hero-title" className="relative isolate flex min-h-svh items-center overflow-hidden pt-16">
          <div aria-hidden className="lx-guides pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-full max-w-[1240px] -translate-x-1/2" />
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_55%_at_78%_45%,rgba(184,145,80,.14),transparent_70%),radial-gradient(40%_45%_at_0%_100%,rgba(36,53,75,.08),transparent_70%)]" />
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            <div className="relative z-10 py-10">
              <div className="rise-in">
                <Eyebrow index="01" label="Operations workspace" />
              </div>
              <h1 id="hero-title" className="rise-in-2 mt-7 font-display text-[clamp(2.7rem,5vw,4.75rem)] leading-[0.96] tracking-[-0.02em] text-lx-ink">
                <span className="block">Less Manual Work.</span>
                <em className="relative inline-block text-lx-sapphire">
                  More Room to Think.
                  <svg aria-hidden viewBox="0 0 300 12" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full">
                    <path d="M2 8 C 80 2, 200 2, 298 6" fill="none" stroke="#b89150" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </em>
              </h1>
              <p className="rise-in-3 mt-8 max-w-[33rem] text-lg leading-relaxed text-lx-muted">
                An intelligent operations workspace for invoices, clients, payment reminders, and business workflows.
              </p>
              <div className="rise-in-3 mt-9 flex flex-wrap items-center gap-3">
                <a href="#workflow" className={BTN_PRIMARY}>
                  Explore the Workflow <ArrowRightIcon className="size-4" />
                </a>
                <Link href={APP_ROUTE} className={BTN_SECONDARY}>
                  Launch OpsPilot
                </Link>
              </div>
              <dl className="rise-in-3 mt-12 grid max-w-[34rem] grid-cols-3 border-t border-lx-line">
                {PRINCIPLES.map(([k, v], i) => (
                  <div key={k} className={`pt-4 pr-3 ${i ? "border-l border-lx-line pl-4" : ""}`}>
                    <dt className="font-display text-xl text-lx-ink">{k}</dt>
                    <dd className="mt-1 text-xs leading-snug text-lx-muted">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <figure className="lx-frame relative h-[46svh] min-h-[320px] border border-lx-line/80 bg-lx-porcelain/40 lg:h-[74svh]">
              <HeroVisual />
              <figcaption className="pointer-events-none absolute bottom-3 left-4 right-4 flex justify-between text-[10px] uppercase tracking-[0.22em] text-lx-stone">
                <span>Fig. 01 — Operations console</span>
                <span className="hidden sm:inline">Drag to rotate</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* 02 — HOW IT WORKS */}
        <section id="workflow" data-tone="light" aria-labelledby="workflow-title" className="relative flex min-h-svh items-center border-t border-lx-line bg-lx-porcelain py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(#ddd3c1_1px,transparent_1px),linear-gradient(90deg,#ddd3c1_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <Eyebrow index="02" label="How it works" />
                <SectionTitle id="workflow-title">
                  From Document <em className="text-lx-sapphire">to Done.</em>
                </SectionTitle>
              </div>
              <p className="max-w-md leading-relaxed text-lx-muted lg:justify-self-end">
                Six stations, one path. Select a stage — or press play — to follow an invoice from upload to a confirmed reminder.
              </p>
            </div>
            <Workflow />
          </div>
        </section>

        {/* 03 — AGENT ARCHITECTURE */}
        <section id="architecture" data-tone="dark" aria-labelledby="architecture-title" className="relative flex min-h-svh items-center overflow-hidden bg-lx-ink py-24 text-lx-porcelain">
          <div aria-hidden className="lx-guides-dark pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[1240px] -translate-x-1/2" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_50%_45%,rgba(36,53,75,.9),transparent_75%)]" />
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <div className="mb-10 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <Eyebrow index="03" label="Agent architecture" dark />
                <SectionTitle id="architecture-title" dark>
                  Intelligence With <em className="text-lx-gold-light">a Job to Do.</em>
                </SectionTitle>
              </div>
              <p className="max-w-md leading-relaxed text-lx-mist lg:justify-self-end">
                One orchestrator, a fixed set of specialists, and code that checks the model&apos;s work. Select a component to see what it does, or play a sample run.
              </p>
            </div>
            <Agents />
          </div>
        </section>

        {/* 04 — PRODUCT EXPERIENCE */}
        <section id="product" data-tone="light" aria-labelledby="product-title" className="relative flex min-h-svh items-center overflow-hidden bg-lx-ivory py-24">
          <div aria-hidden className="lx-guides pointer-events-none absolute inset-y-0 left-1/2 w-full max-w-[1240px] -translate-x-1/2" />
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <div className="mb-12 max-w-2xl">
              <Eyebrow index="04" label="Product experience" />
              <SectionTitle id="product-title">
                See the Work, <em className="text-lx-sapphire">Not Just the Promise.</em>
              </SectionTitle>
            </div>
            <Product />
          </div>
        </section>

        {/* 05 — FINAL CTA */}
        <section id="launch" data-tone="light" aria-labelledby="launch-title" className="relative flex min-h-svh flex-col overflow-hidden border-t border-lx-line bg-lx-porcelain pt-24">
          <div className="relative mx-auto grid w-full max-w-[1240px] flex-1 items-center gap-12 px-5 pb-16 sm:px-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <Eyebrow index="05" label="Get started" />
              <SectionTitle id="launch-title">
                Make Room for the <em className="text-lx-sapphire">Important Work.</em>
              </SectionTitle>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-lx-muted">
                Bring your business operations into one organized workspace and spend less time on repetitive tasks.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href={APP_ROUTE} className={BTN_PRIMARY}>
                  Launch OpsPilot <ArrowRightIcon className="size-4" />
                </Link>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={BTN_SECONDARY}>
                  <GitHubMark className="size-4" /> Explore the Code
                </a>
              </div>
            </div>
            <div className="lx-frame border border-lx-line bg-lx-ivory/60 p-4 sm:p-6">
              <FinaleArt />
            </div>
          </div>

          <footer className="relative bg-lx-ink text-lx-mist">
            <div className="h-[2px] bg-gradient-to-r from-transparent via-lx-gold to-transparent opacity-70" />
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-4 px-5 py-8 text-sm sm:px-8">
              <span className="flex items-center gap-2.5 font-semibold text-lx-porcelain">
                <Monogram className="size-6" /> OpsPilot AI
              </span>
              <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                <a href="#workflow" className="hover:text-lx-gold-light">How it works</a>
                <a href="#architecture" className="hover:text-lx-gold-light">Architecture</a>
                <a href="#product" className="hover:text-lx-gold-light">Product</a>
                <Link href={LOGIN_ROUTE} className="hover:text-lx-gold-light">Sign in</Link>
                <Link href="/privacy" className="hover:text-lx-gold-light">Privacy</Link>
                <Link href="/terms" className="hover:text-lx-gold-light">Terms</Link>
              </nav>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-2 hover:text-lx-gold-light">
                <GitHubMark className="size-4" /> GitHub
              </a>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
