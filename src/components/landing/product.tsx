"use client";

import { useRef, useState } from "react";
import { PRODUCT_TABS, type ProductTab } from "./content";
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
  danger: "bg-[#e5484d]/12 text-[#ff8d90] border-[#e5484d]/25",
  warn: "bg-[#f2a83b]/12 text-[#f2c27a] border-[#f2a83b]/25",
  info: "bg-[#3b5bff]/14 text-[#9db1ff] border-[#3b5bff]/25",
  ok: "bg-[#2fa77a]/14 text-[#6fe0ae] border-[#2fa77a]/25",
  neutral: "bg-white/6 text-[#aab3cc] border-white/10",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${TONE[tone]}`}>{children}</span>;
}

function Row({ cells }: { cells: React.ReactNode[] }) {
  return (
    <div className="grid grid-cols-[1.1fr_1.4fr_1fr_auto] items-center gap-3 border-b border-white/[0.06] px-4 py-2.5 text-[13px] text-[#d6dbea] last:border-0">
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
              <div key={k} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
                <p className="text-[11px] text-[#8d97b5]">{k}</p>
                <p className="mt-2 text-[13px] font-semibold text-[#eef1fb]">{v}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03]">
            <p className="px-4 pt-3 text-[12px] font-medium text-[#eef1fb]">Recent tasks</p>
            <Row cells={[<Badge key="a" tone="warn">Awaiting approval</Badge>, "Chase all overdue invoices", "", ""]} />
            <Row cells={[<Badge key="b" tone="ok">Succeeded</Badge>, "Extract 3 uploaded invoices", "", ""]} />
            <Row cells={[<Badge key="c" tone="ok">Succeeded</Badge>, "What's overdue right now?", "", ""]} />
          </div>
        </div>
      );
    case "invoices":
      return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03]">
          {SAMPLE_INVOICES.map((r) => (
            <Row key={r.n} cells={[r.n, r.c, r.a, <Badge key="s" tone={r.t}>{r.s}</Badge>]} />
          ))}
        </div>
      );
    case "clients":
      return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03]">
          {[
            ["Northwind Studio", "accounts@northwind.example.com", "$3,250.00"],
            ["Lumen Analytics", "finance@lumen.example.com", "₹100,000.00"],
            ["Brightpath Education", "billing@brightpath.example.com", "€1,200.00"],
            ["Oakline Interiors", "hello@oakline.example.com", "$640.00"],
          ].map(([n, e, o]) => (
            <Row key={n} cells={[n, <span key="e" className="text-[#8d97b5]">{e}</span>, o, <Badge key="x" tone="neutral">From invoice</Badge>]} />
          ))}
        </div>
      );
    case "payments":
      return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03]">
          <Row cells={["2026-10-24", "Transfer ref SAMPLE-1004", "$850.00", <Badge key="a" tone="warn">Suggested match</Badge>]} />
          <Row cells={["2026-10-20", "Lumen Analytics", "₹50,000.00", <Badge key="b" tone="ok">Applied</Badge>]} />
          <Row cells={["2026-10-18", "Unknown payer", "$120.00", <Badge key="c" tone="neutral">Unmatched</Badge>]} />
          <p className="px-4 py-2.5 text-[11px] text-[#8d97b5]">Reason: reference mentions invoice number; amount equals outstanding balance</p>
        </div>
      );
    case "documents":
      return (
        <div className="space-y-3">
          <div className="grid place-items-center rounded-xl border border-dashed border-white/15 py-6 text-[12px] text-[#8d97b5]">
            Drop invoice files here · PDF, PNG, JPG or WEBP · up to 10 MB
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03]">
            <Row cells={["invoice_001.pdf", <Badge key="a" tone="ok">Processed</Badge>, "", ""]} />
            <Row cells={["invoice_photo.png", <Badge key="b" tone="info">Processing</Badge>, "", ""]} />
            <Row cells={["receipt.pdf", <Badge key="c" tone="danger">Rejected</Badge>, "", <span key="r" className="text-[11px] text-[#8d97b5]">Not an invoice</span>]} />
          </div>
        </div>
      );
    case "tasks":
      return (
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
          {[
            ["Plan the work", "Planner", "ok"],
            ["Find overdue invoices", "Data", "ok"],
            ["Match invoices to clients and email addresses", "Data", "ok"],
            ["Draft reminder emails", "Action", "ok"],
            ["Check every draft against its invoice", "Verification", "ok"],
            ["Ask you to approve the emails", "Action", "warn"],
          ].map(([l, lane, t]) => (
            <div key={l} className="flex items-center gap-3 border-b border-white/[0.06] py-2 text-[13px] text-[#d6dbea] last:border-0">
              <span className={`grid size-4 place-items-center rounded-full text-[9px] ${t === "ok" ? "bg-[#2fa77a]/25 text-[#6fe0ae]" : "bg-[#f2a83b]/25 text-[#f2c27a]"}`}>{t === "ok" ? "✓" : "…"}</span>
              <span className="flex-1">{l}</span>
              <span className="text-[11px] text-[#8d97b5]">{lane}</span>
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
            <div key={to} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#eef1fb]">
                <span className="font-medium">To {to}</span>
                <span className="text-[#8d97b5]">{amt}</span>
                <span className="rounded-md border border-dashed border-white/25 px-1.5 text-[10px] text-[#d6dbea]">AI draft</span>
                <Badge tone="neutral">{stage}</Badge>
                <span className="ml-auto flex gap-1.5">
                  <span className="rounded-md bg-[#eef1fb] px-2 py-0.5 text-[11px] font-medium text-[#0b1430]">Approve</span>
                  <span className="rounded-md border border-white/15 px-2 py-0.5 text-[11px]">Reject</span>
                </span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#8d97b5]">
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
  const reducedMotion = useReducedMotion();
  const section = useScrollVar<HTMLDivElement>("--p");
  const tilt = useRef<HTMLDivElement>(null);
  const info = PRODUCT_TABS.find((t) => t.id === tab)!;

  return (
    <div ref={section} className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0">
        <div role="tablist" aria-label="Product areas" className="flex flex-wrap gap-2 lg:flex-col lg:items-start">
          {PRODUCT_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`pt-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="product-screen"
              onClick={() => setTab(t.id)}
              className={`group flex items-center gap-3 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#3b5bff] lg:rounded-none lg:px-0 ${tab === t.id ? "bg-[#141a2b] text-[#f4efe6] lg:bg-transparent lg:text-[#141a2b]" : "text-[#5b6070] hover:text-[#141a2b]"}`}
            >
              <span className={`hidden h-px transition-all lg:block ${tab === t.id ? "w-8 bg-[#3b5bff]" : "w-4 bg-[#141a2b]/25 group-hover:w-6"}`} />
              <span className={tab === t.id ? "lg:font-display lg:text-2xl" : "lg:text-base"}>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-8 border-t border-[#141a2b]/12 pt-6" aria-live="polite">
          <h3 className="font-display text-3xl leading-tight text-[#141a2b]">{info.title}</h3>
          <p className="mt-3 leading-relaxed text-[#3b4050]">{info.body}</p>
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
          className="product-window relative origin-center rounded-[18px] border border-[#0b1430]/20 bg-[#0b0d14] shadow-[0_60px_120px_-40px_rgba(11,20,48,.65)]"
          data-reduced={reducedMotion ? "true" : "false"}
        >
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="ml-3 text-[12px] text-[#8d97b5]">OpsPilot — {info.label}</span>
            <span className="ml-auto rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#aab3cc]">Sample data</span>
          </div>
          <div className="flex min-h-[380px]">
            <aside className="hidden w-40 shrink-0 border-r border-white/[0.06] bg-[#0f121b] p-3 sm:block">
              {PRODUCT_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  tabIndex={-1}
                  aria-hidden
                  onClick={() => setTab(t.id)}
                  className={`block w-full rounded-md px-2.5 py-1.5 text-left text-[12px] ${tab === t.id ? "bg-[#1c2131] font-medium text-white" : "text-[#7e869e] hover:text-[#c9cfe0]"}`}
                >
                  {t.id === "overview" ? "Dashboard" : t.label}
                </button>
              ))}
            </aside>
            <div id="product-screen" role="tabpanel" aria-labelledby={`pt-${tab}`} className="min-w-0 flex-1 p-4">
              <div className="mb-3 h-8 rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 text-[12px] leading-8 text-[#7e869e]">
                ✦ Tell OpsPilot what to do…
              </div>
              <Screen tab={tab} />
            </div>
          </div>
        </div>

        {/* Floating execution-state legend (demonstration states) */}
        <div className="product-float absolute -bottom-8 -left-4 hidden rounded-2xl border border-[#141a2b]/10 bg-[#f9f6ef] p-4 shadow-[0_30px_60px_-25px_rgba(11,20,48,.5)] md:block">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#6b6f80]">Task states</p>
          <ul className="mt-2 space-y-1.5">
            {TIMELINE.map((s) => (
              <li key={s.label} className="flex items-center gap-2 text-[13px] text-[#141a2b]">
                <span className={`size-2 rounded-full ${s.tone === "ok" ? "bg-[#2fa77a]" : s.tone === "warn" ? "bg-[#f2a83b]" : "bg-[#3b5bff]"}`} />
                {s.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
