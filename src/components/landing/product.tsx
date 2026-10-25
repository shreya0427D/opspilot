"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { PRODUCT_POINTS, PRODUCT_TABS, type ProductTab } from "./content";
import { useReducedMotion, useScrollVar } from "./hooks";

// A faithful mockup of the real dashboard (same areas, labels and states). Records are sample
// data and labelled as such. Scroll progress drives the window from a spatial angle to a flat,
// readable view; the pointer adds a slight tilt.

const SAMPLE_INVOICES = [
  { n: "SAMPLE-1001", c: "Northwind Studio", a: "$2,400.00", s: "Overdue", t: "danger" },
  { n: "SAMPLE-1002", c: "Lumen Analytics", a: "₹100,000.00", s: "Partly paid", t: "warn" },
  { n: "SAMPLE-1003", c: "Brightpath Education", a: "€1,200.00", s: "Overdue", t: "danger" },
  { n: "SAMPLE-1005", c: "Oakline Interiors", a: "$640.00", s: "Open", t: "info" },
  { n: "SAMPLE-1006", c: "Oakline Interiors", a: "$0.00", s: "Paid", t: "ok" },
];

const TONE: Record<string, string> = {
  danger: "bg-[#e08a7e]/12 text-[#f0aaa0] border-[#e08a7e]/30",
  warn: "bg-[#b89150]/15 text-[#e2c992] border-[#b89150]/35",
  info: "bg-[#8fa3bc]/14 text-[#c3d1e2] border-[#8fa3bc]/30",
  ok: "bg-[#8cc3a0]/14 text-[#acd9bb] border-[#8cc3a0]/30",
  neutral: "bg-white/5 text-[#b9c4d2] border-white/12",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>{children}</span>;
}

const PANEL = "rounded-lg border border-[#2e425a] bg-[#1e2d40]/70";

function Row({ cells }: { cells: React.ReactNode[] }) {
  return (
    <div className="grid grid-cols-[1.1fr_1.4fr_1fr_auto] items-center gap-3 border-b border-[#2e425a]/70 px-4 py-2.5 text-[13px] text-[#dfe5ec] last:border-0">
      {cells.map((c, i) => (
        <div key={i} className={i === 2 ? "text-right tabular-nums" : "truncate"}>{c}</div>
      ))}
    </div>
  );
}

function Screen({ tab }: { tab: ProductTab }) {
  switch (tab) {
    case "overview":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Overdue", "$3,250.00 · €1,200.00"],
              ["Outstanding (all open)", "Per currency, never converted"],
              ["Needs your attention", "1 batch · 1 invoice to review"],
            ].map(([k, v]) => (
              <div key={k} className={`${PANEL} p-3`}>
                <p className="text-[11px] text-[#b9c4d2]">{k}</p>
                <p className="mt-2 text-[13px] font-semibold text-[#fffcf6]">{v}</p>
              </div>
            ))}
          </div>
          <div className={PANEL}>
            <p className="px-4 pt-3 text-[12px] font-medium text-[#fffcf6]">Recent tasks</p>
            <Row cells={[<Badge key="a" tone="warn">Awaiting approval</Badge>, "Chase all overdue invoices", "", ""]} />
            <Row cells={[<Badge key="b" tone="ok">Succeeded</Badge>, "Extract 3 uploaded invoices", "", ""]} />
            <Row cells={[<Badge key="c" tone="ok">Succeeded</Badge>, "What's overdue right now?", "", ""]} />
          </div>
        </div>
      );
    case "invoices":
      return (
        <div className={PANEL}>
          {SAMPLE_INVOICES.map((r) => (
            <Row key={r.n} cells={[r.n, r.c, r.a, <Badge key="s" tone={r.t}>{r.s}</Badge>]} />
          ))}
        </div>
      );
    case "clients":
      return (
        <div className={PANEL}>
          {[
            ["Northwind Studio", "accounts@northwind.example.com", "$3,250.00"],
            ["Lumen Analytics", "finance@lumen.example.com", "₹100,000.00"],
            ["Brightpath Education", "billing@brightpath.example.com", "€1,200.00"],
            ["Oakline Interiors", "hello@oakline.example.com", "$640.00"],
          ].map(([n, e, o]) => (
            <Row key={n} cells={[n, <span key="e" className="text-[#b9c4d2]">{e}</span>, o, <Badge key="x" tone="neutral">From invoice</Badge>]} />
          ))}
        </div>
      );
    case "payments":
      return (
        <div className={PANEL}>
          <Row cells={["2026-10-24", "Transfer ref SAMPLE-1004", "$850.00", <Badge key="a" tone="warn">Suggested match</Badge>]} />
          <Row cells={["2026-10-20", "Lumen Analytics", "₹50,000.00", <Badge key="b" tone="ok">Applied</Badge>]} />
          <Row cells={["2026-10-18", "Unknown payer", "$120.00", <Badge key="c" tone="neutral">Unmatched</Badge>]} />
          <p className="px-4 py-2.5 text-[11px] text-[#b9c4d2]">Reason: reference mentions invoice number; amount equals outstanding balance</p>
        </div>
      );
    case "documents":
      return (
        <div className="space-y-3">
          <div className="grid place-items-center rounded-lg border border-dashed border-[#b89150]/40 py-6 text-[12px] text-[#b9c4d2]">
            Drop invoice files here · PDF, PNG, JPG or WEBP · up to 10 MB
          </div>
          <div className={PANEL}>
            <Row cells={["invoice_001.pdf", <Badge key="a" tone="ok">Processed</Badge>, "", ""]} />
            <Row cells={["invoice_photo.png", <Badge key="b" tone="info">Processing</Badge>, "", ""]} />
            <Row cells={["receipt.pdf", <Badge key="c" tone="danger">Rejected</Badge>, "", <span key="r" className="text-[11px] text-[#b9c4d2]">Not an invoice</span>]} />
          </div>
        </div>
      );
    case "tasks":
      return (
        <div className={`${PANEL} px-4 py-3`}>
          {[
            ["Plan the work", "Planner", "ok"],
            ["Find overdue invoices", "Data", "ok"],
            ["Match invoices to clients and email addresses", "Data", "ok"],
            ["Draft reminder emails", "Action", "ok"],
            ["Check every draft against its invoice", "Verification", "ok"],
            ["Ask you to approve the emails", "Action", "warn"],
          ].map(([l, lane, t]) => (
            <div key={l} className="flex items-center gap-3 border-b border-[#2e425a]/70 py-2 text-[13px] text-[#dfe5ec] last:border-0">
              <span className={`grid size-4 place-items-center rounded-full text-[9px] ${t === "ok" ? "bg-[#8cc3a0]/25 text-[#acd9bb]" : "bg-[#b89150]/30 text-[#e2c992]"}`}>{t === "ok" ? "✓" : "…"}</span>
              <span className="flex-1">{l}</span>
              <span className="text-[11px] text-[#b9c4d2]">{lane}</span>
            </div>
          ))}
        </div>
      );
    case "approvals":
      return (
        <div className="space-y-3">
          {[
            ["accounts@northwind.example.com", "$2,400.00", "firm"],
            ["billing@brightpath.example.com", "€1,200.00", "friendly"],
          ].map(([to, amt, stage]) => (
            <div key={to} className={`${PANEL} p-3`}>
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#fffcf6]">
                <span className="font-medium">To {to}</span>
                <span className="text-[#b9c4d2]">{amt}</span>
                <span className="rounded-md border border-dashed border-[#b89150]/50 px-1.5 text-[10px] text-[#e2c992]">AI draft</span>
                <Badge tone="neutral">{stage}</Badge>
                <span className="ml-auto flex gap-1.5">
                  <span className="lx-gold rounded-md px-2 py-0.5 text-[11px] font-semibold">Approve</span>
                  <span className="rounded-md border border-white/15 px-2 py-0.5 text-[11px]">Reject</span>
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#b9c4d2]">
                Invoice {stage === "firm" ? "SAMPLE-1001" : "SAMPLE-1003"} for {amt} is past its due date. Could you let me know when I can expect payment?
              </p>
            </div>
          ))}
        </div>
      );
  }
}

const TIMELINE = [
  { label: "Planning", tone: "info" },
  { label: "Running", tone: "info" },
  { label: "Awaiting approval", tone: "warn" },
  { label: "Succeeded", tone: "ok" },
  { label: "Needs review", tone: "warn" },
];

export function Product() {
  const [tab, setTab] = useState<ProductTab>("overview");
  const [point, setPoint] = useState(0);
  const reducedMotion = useReducedMotion();
  const section = useScrollVar<HTMLDivElement>("--p");
  const tilt = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const info = PRODUCT_TABS.find((t) => t.id === tab)!;
  const points = PRODUCT_POINTS[tab];

  const choose = (id: ProductTab) => {
    setTab(id);
    setPoint(0);
  };

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const last = PRODUCT_TABS.length - 1;
    const keys: Record<string, number> = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: last };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = Math.min(last, Math.max(0, keys[e.key]));
    choose(PRODUCT_TABS[next].id);
    tabs.current[next]?.focus();
  }

  return (
    <div ref={section} className="grid gap-10 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0">
        <div role="tablist" aria-label="Product areas" aria-orientation="vertical" className="flex flex-wrap gap-2 lg:flex-col lg:gap-0 lg:border-l lg:border-lx-line">
          {PRODUCT_TABS.map((t, i) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                type="button"
                id={`pt-${t.id}`}
                aria-selected={on}
                aria-controls="product-screen"
                tabIndex={on ? 0 : -1}
                onClick={() => choose(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={`group relative flex items-baseline gap-3 rounded-full px-3 py-1.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lx-gold lg:rounded-none lg:py-2 lg:pl-5 ${on ? "bg-lx-sapphire text-lx-porcelain lg:bg-transparent lg:text-lx-ink" : "text-lx-muted hover:text-lx-ink"}`}
              >
                <span aria-hidden className={`absolute -left-px top-0 hidden h-full w-[2px] transition-colors lg:block ${on ? "bg-lx-gold" : "bg-transparent group-hover:bg-lx-line"}`} />
                <span className={`hidden font-display text-xs lg:inline ${on ? "text-lx-gold-ink" : "text-lx-stone"}`}>4.{i + 1}</span>
                <span className={on ? "lg:font-display lg:text-[1.65rem] lg:leading-none" : "lg:text-base"}>{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-8 border-t border-lx-line pt-6" aria-live="polite">
          <h3 className="font-display text-3xl leading-tight text-lx-ink">{info.title}</h3>
          <p className="mt-3 leading-relaxed text-lx-muted">{info.body}</p>
          <ul className="mt-5 space-y-1.5" aria-label="Features">
            {points.map((p, i) => (
              <li key={p.title}>
                <button
                  type="button"
                  aria-expanded={point === i}
                  onClick={() => setPoint(i)}
                  onMouseEnter={() => setPoint(i)}
                  onFocus={() => setPoint(i)}
                  className={`w-full border px-3.5 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-lx-gold ${point === i ? "border-lx-gold/60 bg-lx-porcelain" : "border-transparent hover:border-lx-line"}`}
                >
                  <span className="flex items-center gap-2.5 text-sm font-medium text-lx-ink">
                    <span className={`size-1.5 rotate-45 ${point === i ? "bg-lx-gold" : "bg-lx-stone/50"}`} />
                    {p.title}
                  </span>
                  {point === i && <span className="mt-1 block pl-4 text-sm leading-snug text-lx-muted">{p.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div
        className="relative min-w-0 [perspective:1800px]"
        onPointerMove={(e) => {
          if (reducedMotion || !tilt.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          tilt.current.style.setProperty("--tx", (((e.clientY - r.top) / r.height - 0.5) * -4).toFixed(2));
          tilt.current.style.setProperty("--ty", (((e.clientX - r.left) / r.width - 0.5) * 5).toFixed(2));
        }}
        onPointerLeave={() => {
          tilt.current?.style.setProperty("--tx", "0");
          tilt.current?.style.setProperty("--ty", "0");
        }}
      >
        <div
          ref={tilt}
          className="product-window relative origin-center overflow-hidden rounded-[14px] border border-lx-ink/40 bg-lx-ink shadow-[0_60px_120px_-40px_rgba(23,34,48,.6),0_0_0_6px_rgba(184,145,80,.12)]"
          data-reduced={reducedMotion ? "true" : "false"}
        >
          <div className="flex items-center gap-2 border-b border-[#2e425a] px-4 py-3">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="ml-3 text-[12px] text-[#b9c4d2]">OpsPilot — {info.label}</span>
            <span className="ml-auto rounded-md border border-[#b89150]/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#e2c992]">Sample data</span>
          </div>
          <div className="flex min-h-[380px]">
            <aside className="hidden w-40 shrink-0 border-r border-[#2e425a] bg-[#1b2a3c] p-3 sm:block">
              {PRODUCT_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={() => choose(t.id)}
                  className={`relative block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] ${tab === t.id ? "bg-[#24354b] font-medium text-white" : "text-[#93a2b5] hover:text-[#dfe5ec]"}`}
                >
                  {tab === t.id && <span className="absolute inset-y-1.5 left-0 w-[2px] rounded bg-[#b89150]" />}
                  {t.label}
                </button>
              ))}
            </aside>
            <div id="product-screen" role="tabpanel" aria-labelledby={`pt-${tab}`} className="min-w-0 flex-1 p-4">
              <div className="mb-3 h-8 rounded-md border border-[#2e425a] bg-[#1e2d40]/70 px-3 text-[12px] leading-8 text-[#93a2b5]">
                <span className="text-[#d9be85]">✦</span> Tell OpsPilot what to do…
              </div>
              <Screen tab={tab} />
            </div>
          </div>
        </div>

        {/* Floating execution-state legend (demonstration states) */}
        <div className="product-float absolute -bottom-8 -left-4 hidden border border-lx-line bg-lx-porcelain p-4 shadow-[0_30px_60px_-25px_rgba(23,34,48,.45)] md:block">
          <p className="text-[10px] uppercase tracking-[0.2em] text-lx-muted">Task states</p>
          <ul className="mt-2 space-y-1.5">
            {TIMELINE.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[13px] text-lx-ink">
                <span className={`size-2 rotate-45 ${s.tone === "ok" ? "bg-[#5f9e77]" : s.tone === "warn" ? "bg-lx-gold" : "bg-lx-sapphire"}`} />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
