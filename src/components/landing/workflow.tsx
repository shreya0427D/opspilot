"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { STAGES } from "./content";
import { useAutoCycle, useHold, useReducedMotion } from "./hooks";

// "From document to done": a connected, dimensional pipeline. Each station is an isometric
// object (document, data layers, checkpoint, client record, approval card, completed state) on
// an ivory plinth. Gold marks the active stage and the path already travelled; sapphire gives
// the structure. The detail panel explains the selected stage.

const W = 1100;
const H = 420;
const STATIONS = STAGES.map((s, i) => ({ ...s, x: 110 + i * 176, y: i % 2 ? 250 : 190 }));
const TRACK = STATIONS.map((s, i) => `${i ? "L" : "M"}${s.x} ${s.y + 70}`).join(" ");

const C = {
  gold: "#b89150",
  goldDeep: "#8a6a35",
  sapphire: "#24354b",
  ink: "#172230",
  stone: "#a79e8f",
  line: "#ddd3c1",
  face: "#fffcf6",
  edge: "#cdbfa5",
};

function Station({ index, active, done }: { index: number; active: boolean; done: boolean }) {
  const s = STATIONS[index];
  const accent = active ? C.gold : done ? C.sapphire : C.stone;
  const lift = active ? -14 : 0;
  // Isometric plinth the object sits on.
  const slab = (
    <g>
      <path d={`M${s.x - 58} ${s.y + 70} L${s.x} ${s.y + 40} L${s.x + 58} ${s.y + 70} L${s.x} ${s.y + 100} Z`} fill={active ? "#efe2c4" : "#f1ebdf"} stroke={active ? C.gold : "none"} strokeWidth="1" />
      <path d={`M${s.x - 58} ${s.y + 70} L${s.x} ${s.y + 100} L${s.x} ${s.y + 108} L${s.x - 58} ${s.y + 78} Z`} fill={active ? "#cdb27a" : "#ddd3c1"} />
      <path d={`M${s.x + 58} ${s.y + 70} L${s.x} ${s.y + 100} L${s.x} ${s.y + 108} L${s.x + 58} ${s.y + 78} Z`} fill={active ? C.gold : "#cfc3ad"} />
    </g>
  );
  const objects = [
    // Upload: stacked documents
    <g key="u">
      {[2, 1, 0].map((k) => (
        <g key={k} transform={`translate(${k * 6} ${-k * 6})`}>
          <path d={`M${s.x - 26} ${s.y + 52} L${s.x - 26} ${s.y - 6} L${s.x + 18} ${s.y - 22} L${s.x + 18} ${s.y + 36} Z`} fill={C.face} stroke={C.edge} />
        </g>
      ))}
      <path d={`M${s.x - 18} ${s.y + 6} L${s.x + 10} ${s.y - 4}`} stroke={accent} strokeWidth="3" />
      <path d={`M${s.x - 18} ${s.y + 18} L${s.x + 4} ${s.y + 10}`} stroke={C.line} strokeWidth="3" />
    </g>,
    // Extract: data layers lifting off a page
    <g key="e">
      {[0, 1, 2].map((k) => (
        <path key={k} d={`M${s.x - 40} ${s.y + 40 - k * 20} L${s.x} ${s.y + 20 - k * 20} L${s.x + 40} ${s.y + 40 - k * 20} L${s.x} ${s.y + 60 - k * 20} Z`} fill={k === 2 ? accent : C.face} fillOpacity={k === 2 ? 0.9 : 1} stroke={C.edge} />
      ))}
    </g>,
    // Validate: checkpoint gate
    <g key="v">
      <rect x={s.x - 34} y={s.y - 10} width="10" height="62" fill={C.sapphire} />
      <rect x={s.x + 24} y={s.y - 10} width="10" height="62" fill={C.sapphire} />
      <rect x={s.x - 34} y={s.y - 18} width="68" height="12" rx="2" fill={accent} />
      <circle cx={s.x} cy={s.y + 24} r="15" fill={C.face} stroke={accent} strokeWidth="3" />
      <path d={`M${s.x - 7} ${s.y + 24} l5 5 l9 -10`} stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>,
    // Organize: client record card
    <g key="o">
      <path d={`M${s.x - 38} ${s.y + 46} L${s.x - 38} ${s.y - 4} L${s.x + 38} ${s.y - 22} L${s.x + 38} ${s.y + 28} Z`} fill={C.face} stroke={C.edge} />
      <circle cx={s.x - 16} cy={s.y + 14} r="10" fill={accent} />
      <path d={`M${s.x} ${s.y + 8} L${s.x + 28} ${s.y + 1}`} stroke={C.sapphire} strokeWidth="3" />
      <path d={`M${s.x} ${s.y + 20} L${s.x + 20} ${s.y + 15}`} stroke={C.line} strokeWidth="3" />
    </g>,
    // Approve: card with an approval toggle
    <g key="a">
      <path d={`M${s.x - 38} ${s.y + 46} L${s.x - 38} ${s.y - 4} L${s.x + 38} ${s.y - 22} L${s.x + 38} ${s.y + 28} Z`} fill={C.face} stroke={C.edge} />
      <rect x={s.x - 22} y={s.y + 10} width="44" height="18" rx="9" fill={active ? C.gold : done ? C.sapphire : "#d9cdb5"} transform={`skewY(-13) translate(0 ${s.x * 0.231})`} />
      <circle cx={s.x + 12} cy={s.y + 19} r="6" fill={C.face} transform={`skewY(-13) translate(0 ${s.x * 0.231})`} />
    </g>,
    // Complete: sent envelope with a gold seal
    <g key="c">
      <path d={`M${s.x - 36} ${s.y + 40} L${s.x - 36} ${s.y + 2} L${s.x + 36} ${s.y - 14} L${s.x + 36} ${s.y + 24} Z`} fill={C.face} stroke={C.edge} />
      <path d={`M${s.x - 36} ${s.y + 2} L${s.x + 2} ${s.y + 18} L${s.x + 36} ${s.y - 14}`} fill="none" stroke={C.edge} />
      <circle cx={s.x + 30} cy={s.y - 18} r="13" fill={active ? C.gold : done ? C.sapphire : C.stone} />
      <path d={`M${s.x + 24} ${s.y - 18} l4 4 l8 -9`} stroke={C.face} strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>,
  ];
  return (
    <g style={{ transition: "transform 500ms cubic-bezier(.2,.7,.2,1)" }} transform={`translate(0 ${lift})`}>
      {active && <ellipse cx={s.x} cy={s.y + 112} rx="54" ry="10" fill={C.ink} opacity=".12" />}
      {slab}
      {objects[index]}
    </g>
  );
}

const BEAT_MS = 2800;

export function Workflow() {
  const [hovered, setHovered] = useState<number | null>(null);
  const { held, hold, focusProps } = useHold();
  const reducedMotion = useReducedMotion();
  // Runs by itself: Upload → … → Complete → Upload. A click (or keyboard focus) holds it briefly to read.
  const { ref, index: active, setIndex } = useAutoCycle<HTMLDivElement>(STAGES.length, reducedMotion ? BEAT_MS * 2 : BEAT_MS, held);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (i: number) => {
    hold();
    setIndex(((i % STAGES.length) + STAGES.length) % STAGES.length);
  };

  // Roving focus for the stage tabs: arrows, Home and End.
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const keys: Record<string, number> = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: STAGES.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = Math.min(STAGES.length - 1, Math.max(0, keys[e.key]));
    select(next);
    tabs.current[next]?.focus();
  }

  const stage = STAGES[active];
  const marker = STATIONS[active];
  const focus = hovered ?? active;

  return (
    <div
      ref={ref}
      className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_350px] lg:items-center"
      {...focusProps}
    >
      <div className="min-w-0">
        <div className="relative overflow-x-auto pb-2 [scrollbar-width:thin]">
          <span className="absolute left-0 top-0 z-10 rounded-full border border-lx-gold/50 bg-lx-porcelain px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-lx-gold-ink">
            Demonstration
          </span>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[760px]" role="img" aria-label="Workflow diagram: upload, extract, validate, organize, approve, complete">
            {/* track */}
            <path d={TRACK} fill="none" stroke={C.line} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            {STATIONS.slice(1).map((s, i) => {
              const prev = STATIONS[i];
              const travelled = i < active;
              const next = i === active; // the segment the invoice travels next
              const lit = travelled || next || i === focus || i + 1 === focus;
              return (
                <line
                  key={s.id}
                  x1={prev.x}
                  y1={prev.y + 70}
                  x2={s.x}
                  y2={s.y + 70}
                  stroke={lit ? (travelled ? C.gold : C.sapphire) : "transparent"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={travelled ? "0" : "6 8"}
                  className={next && !reducedMotion ? "wf-flow" : undefined}
                  style={{ transition: "stroke 600ms ease" }}
                />
              );
            })}
            {STATIONS.map((s, i) => (
              <g key={s.id} className="cursor-pointer" onClick={() => select(i)} onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
                <Station index={i} active={i === active} done={i < active} />
              </g>
            ))}
            {/* travelling marker */}
            <g style={{ transform: `translate(${marker.x}px, ${marker.y + 70}px)`, transition: reducedMotion ? "none" : "transform 900ms cubic-bezier(.65,0,.35,1)" }}>
              <circle r="13" fill={C.gold} opacity=".22" className={reducedMotion ? undefined : "wf-pulse"} />
              <circle r="6" fill={C.goldDeep} stroke={C.face} strokeWidth="2" />
            </g>
            {STATIONS.map((s, i) => (
              <text key={s.id} x={s.x} y={s.y + 140} textAnchor="middle" className="font-sans" fontSize="17" fontWeight={i === active ? 700 : 500} fill={i === active ? C.ink : i === focus ? C.sapphire : "#6e675c"} style={{ transition: "fill 400ms" }}>
                <tspan fill={i === active ? C.goldDeep : "#a79e8f"} fontWeight="500">{String(i + 1).padStart(2, "0")}</tspan> {s.name}
              </text>
            ))}
          </svg>
        </div>

        {/* Accessible stage tabs: the loop moves the selection; clicking jumps to a stage */}
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Workflow stages">
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`wf-tab-${s.id}`}
              aria-selected={i === active}
              aria-controls="wf-panel"
              tabIndex={i === active ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => onTabKey(e, i)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lx-gold ${i === active ? "border-lx-sapphire bg-lx-sapphire text-lx-porcelain" : "border-lx-line bg-lx-porcelain text-lx-muted hover:border-lx-gold hover:text-lx-ink"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div id="wf-panel" role="tabpanel" aria-labelledby={`wf-tab-${stage.id}`} className="relative border border-lx-line bg-lx-porcelain p-6 shadow-[0_30px_60px_-34px_rgba(23,34,48,.45)]">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-lx-gold-deep via-lx-gold to-transparent" />
        {/* step progress: one bar per stage */}
        <div aria-hidden className="mb-4 flex gap-1">
          {STAGES.map((s, i) => (
            <span key={s.id} className={`h-[3px] flex-1 rounded-full transition-colors duration-700 ${i <= active ? "bg-lx-gold" : "bg-lx-line"}`} />
          ))}
        </div>
        <div key={stage.id} className="lx-fade-in">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-lx-gold-ink">
            Step {String(active + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
          </p>
          <h3 className="mt-2 font-display text-4xl leading-tight text-lx-ink">{stage.name}</h3>
          <p className="mt-1 text-sm text-lx-muted">{stage.kicker}</p>
          <p className="mt-4 leading-relaxed text-lx-sapphire">{stage.body}</p>
          <ul className="mt-4 space-y-2 text-sm text-lx-muted">
            {stage.detail.map((d) => (
              <li key={d} className="flex gap-2.5">
                <span className="mt-[7px] size-1.5 shrink-0 rotate-45 bg-lx-gold" />
                {d}
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-5 border-t border-lx-line pt-4 text-xs text-lx-muted">
          Demonstration of the workflow — it runs on its own and no real invoice is being processed here.
        </p>
      </div>
    </div>
  );
}
