import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import Link from "next/link";
import { Agents } from "@/components/landing/agents";
import { APP_ROUTE, GITHUB_URL, LOGIN_ROUTE } from "@/components/landing/content";
import { HeroVisual } from "@/components/landing/hero-visual";
import { Product } from "@/components/landing/product";
import { SiteNav } from "@/components/landing/site-nav";
import { Workflow } from "@/components/landing/workflow";

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif-display" });

export const metadata: Metadata = {
  title: "OpsPilot AI — Less manual work. More room to think.",
  description:
    "An AI-powered operations assistant that turns invoices, business data and repetitive tasks into organized workflows — with you approving every action.",
};

function Eyebrow({ index, label, light }: { index: string; label: string; light?: boolean }) {
  return (
    <p className={`flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] ${light ? "text-[#5a6070]" : "text-[#8d97b5]"}`}>
      <span className={light ? "text-[#3b5bff]" : "text-[#f2a83b]"}>{index}</span>
      <span className={`h-px w-8 ${light ? "bg-[#141a2b]/25" : "bg-white/25"}`} />
      {label}
    </p>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/** Section 05 artwork: the document, workflow path, agent nodes and console resolve into one system. */
function FinaleArt() {
  return (
    <svg viewBox="0 0 640 420" className="w-full" role="img" aria-label="The document, workflow, agent and console motifs joined into one completed system">
      <defs>
        <linearGradient id="fa-metal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a3150" />
          <stop offset="1" stopColor="#10152a" />
        </linearGradient>
        <radialGradient id="fa-glow">
          <stop offset="0" stopColor="#3b5bff" stopOpacity=".45" />
          <stop offset="1" stopColor="#3b5bff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse className="finale-glow" cx="330" cy="230" rx="260" ry="150" fill="url(#fa-glow)" />
      {/* path from document → nodes → console → completion */}
      <path className="finale-line" style={{ ["--len" as string]: 760 }} d="M120 250 C 170 250, 170 150, 230 150 S 300 110, 330 140 S 420 250, 520 210" fill="none" stroke="#5ad1e6" strokeWidth="2.5" strokeLinecap="round" />
      {/* document */}
      <g transform="translate(60 190) rotate(-6)">
        <rect width="92" height="120" rx="3" fill="#f6f1e7" />
        <rect x="12" y="16" width="44" height="7" fill="#1a1f2e" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x="12" y={36 + i * 14} width={i % 2 ? 48 : 66} height="4" fill="#d9d0bf" />
        ))}
      </g>
      {/* agent nodes */}
      {[
        [230, 150],
        [330, 140],
      ].map(([x, y], i) => (
        <g key={i}>
          <polygon points={`${x - 22},${y} ${x - 11},${y - 10} ${x + 11},${y - 10} ${x + 22},${y} ${x + 11},${y + 10} ${x - 11},${y + 10}`} fill="#1c2a5e" stroke="#7aa2ff" />
          <circle cx={x} cy={y} r="3" fill="#bff1ff" />
        </g>
      ))}
      {/* console */}
      <rect x="380" y="170" width="200" height="128" rx="10" fill="url(#fa-metal)" />
      <rect x="388" y="178" width="184" height="112" rx="5" fill="#0b0d14" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <circle cx="402" cy={198 + i * 22} r="5" fill="#2fa77a" opacity=".85" />
          <rect x="414" y={195 + i * 22} width={110 - i * 18} height="6" rx="3" fill="#2a3354" />
        </g>
      ))}
      <rect x="400" y="262" width="96" height="16" rx="8" fill="#2fa77a" fillOpacity=".2" />
      <text x="448" y="274" textAnchor="middle" fontSize="10" fill="#6fe0ae" fontFamily="system-ui">Succeeded</text>
      {/* completion */}
      <circle cx="520" cy="210" r="0" fill="none" />
      <g transform="translate(560 150)">
        <circle r="26" fill="#f2a83b" />
        <path d="M-10 0 l7 7 l14 -15" stroke="#1b1305" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <div className={`landing-root ${display.variable} min-h-svh bg-[#070b16] font-sans text-[#e9ecf5] antialiased`}>
      <a href="#workflow" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-20 focus:z-[60] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-black">
        Skip to content
      </a>
      <SiteNav />

      <main>
        {/* 01 — HERO */}
        <section id="hero" data-tone="dark" aria-labelledby="hero-title" className="relative isolate flex min-h-svh items-center overflow-hidden pt-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_75%_40%,rgba(59,91,255,.18),transparent_70%),radial-gradient(40%_40%_at_10%_90%,rgba(242,168,59,.08),transparent_70%)]" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-b from-transparent to-[#070b16]" />
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
            <div className="relative z-10 py-10">
              <div className="rise-in">
                <Eyebrow index="01" label="Operations, in motion" />
              </div>
              <h1 id="hero-title" className="rise-in-2 mt-6 font-display text-[clamp(2.9rem,6.2vw,5.6rem)] leading-[0.95] tracking-[-0.02em] text-[#f4efe6]">
                <span className="whitespace-nowrap">Less Manual Work.</span>
                <br />
                <em className="whitespace-nowrap text-[#9db1ff]">More Room to Think.</em>
              </h1>
              <p className="rise-in-3 mt-6 max-w-[34rem] text-lg leading-relaxed text-[#b4bdd4]">
                An AI-powered operations assistant that turns invoices, business data, and repetitive tasks into organized workflows.
              </p>
              <div className="rise-in-3 mt-9 flex flex-wrap items-center gap-3">
                <a href="#workflow" className="inline-flex items-center gap-2 rounded-full bg-[#f2a83b] px-6 py-3 text-sm font-semibold text-[#1b1305] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2a83b]">
                  Explore the Workflow <ArrowRightIcon className="size-4" />
                </a>
                <Link href={APP_ROUTE} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-[#f4efe6] transition-colors hover:border-white/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  Open OpsPilot
                </Link>
              </div>
              <p className="rise-in-3 mt-10 max-w-[30rem] text-sm text-[#7e88a8]">
                Built for freelancers chasing invoices. The AI drafts; code checks the numbers; you approve every email.
              </p>
            </div>
            <div className="relative h-[46svh] min-h-[320px] lg:h-[78svh]">
              <HeroVisual />
              <p className="pointer-events-none absolute bottom-3 right-2 hidden text-[11px] uppercase tracking-[0.2em] text-[#5f6a8c] lg:block">
                Interactive model · drag to rotate
              </p>
            </div>
          </div>
        </section>

        {/* 02 — WORKFLOW */}
        <section id="workflow" data-tone="light" aria-labelledby="workflow-title" className="relative flex min-h-svh scroll-mt-0 items-center bg-[#f4efe6] py-24 text-[#141a2b]">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(#141a2b14_1px,transparent_1px)] [background-size:22px_22px]" />
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <div className="mb-12 grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <Eyebrow index="02" label="The workflow" light />
                <h2 id="workflow-title" className="mt-5 font-display text-[clamp(2.6rem,5.5vw,4.6rem)] leading-[0.98] tracking-[-0.015em]">
                  From document <em className="text-[#3b5bff]">to done.</em>
                </h2>
              </div>
              <p className="max-w-md text-[#3b4050] lg:justify-self-end">
                Six stations, one path. Select a stage — or press play — to follow an invoice from upload to a confirmed reminder.
              </p>
            </div>
            <Workflow />
          </div>
        </section>

        {/* 03 — ARCHITECTURE */}
        <section id="architecture" data-tone="dark" aria-labelledby="architecture-title" className="relative flex min-h-svh items-center overflow-hidden bg-[#0b1430] py-24">
          <div aria-hidden className="pointer-events-none absolute -right-40 top-10 size-[520px] rounded-full bg-[#3b5bff]/10 blur-3xl" />
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <div className="mb-10 max-w-2xl">
              <Eyebrow index="03" label="The agent system" />
              <h2 id="architecture-title" className="mt-5 font-display text-[clamp(2.6rem,5.5vw,4.6rem)] leading-[0.98] tracking-[-0.015em] text-[#f4efe6]">
                Intelligence with <em className="text-[#5ad1e6]">a job to do.</em>
              </h2>
              <p className="mt-5 text-[#aab3cc]">
                One orchestrator, a fixed set of tools, and code that checks the model&apos;s work. Select a component to see what it does, or play a sample run.
              </p>
            </div>
            <Agents />
          </div>
        </section>

        {/* 04 — PRODUCT */}
        <section id="product" data-tone="light" aria-labelledby="product-title" className="relative flex min-h-svh items-center overflow-hidden bg-[#ece6da] py-24 text-[#141a2b]">
          <div className="relative mx-auto w-full max-w-[1240px] px-5 sm:px-8">
            <div className="mb-12 max-w-2xl">
              <Eyebrow index="04" label="The product" light />
              <h2 id="product-title" className="mt-5 font-display text-[clamp(2.6rem,5.5vw,4.6rem)] leading-[0.98] tracking-[-0.015em]">
                See the work, <em className="text-[#3b5bff]">not just the promise.</em>
              </h2>
            </div>
            <Product />
          </div>
        </section>

        {/* 05 — LAUNCH */}
        <section id="launch" data-tone="dark" aria-labelledby="launch-title" className="relative flex min-h-svh flex-col overflow-hidden bg-[#070b16] pt-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_45%,rgba(59,91,255,.14),transparent_70%),radial-gradient(35%_30%_at_20%_80%,rgba(242,168,59,.07),transparent_70%)]" />
          <div className="relative mx-auto grid w-full max-w-[1240px] flex-1 items-center gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1fr]">
            <div>
              <Eyebrow index="05" label="Get started" />
              <h2 id="launch-title" className="mt-5 font-display text-[clamp(2.8rem,6vw,5.2rem)] leading-[0.96] tracking-[-0.015em] text-[#f4efe6]">
                Let Your Workflow <em className="text-[#f2a83b]">Move Forward.</em>
              </h2>
              <p className="mt-6 max-w-md text-lg leading-relaxed text-[#b4bdd4]">
                Bring your business operations into one organized workspace and spend less time on repetitive work.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href={APP_ROUTE} className="inline-flex items-center gap-2 rounded-full bg-[#f2a83b] px-6 py-3 text-sm font-semibold text-[#1b1305] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f2a83b]">
                  Launch OpsPilot <ArrowRightIcon className="size-4" />
                </Link>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-[#f4efe6] transition-colors hover:border-white/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  <GitHubMark className="size-4" /> Explore the Code
                </a>
              </div>
            </div>
            <FinaleArt />
          </div>

          <footer className="relative mt-16 border-t border-white/10">
            <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-8 gap-y-3 px-5 py-8 text-sm text-[#7e88a8] sm:px-8">
              <span className="font-semibold text-[#e9ecf5]">OpsPilot AI</span>
              <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                <a href="#workflow" className="hover:text-[#e9ecf5]">How it works</a>
                <a href="#architecture" className="hover:text-[#e9ecf5]">Architecture</a>
                <a href="#product" className="hover:text-[#e9ecf5]">Product</a>
                <Link href={LOGIN_ROUTE} className="hover:text-[#e9ecf5]">Sign in</Link>
                <Link href="/privacy" className="hover:text-[#e9ecf5]">Privacy</Link>
                <Link href="/terms" className="hover:text-[#e9ecf5]">Terms</Link>
              </nav>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-2 hover:text-[#e9ecf5]">
                <GitHubMark className="size-4" /> GitHub
              </a>
            </div>
          </footer>
        </section>
      </main>
    </div>
  );
}
