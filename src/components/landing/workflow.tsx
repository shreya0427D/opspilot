"use client";

import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { STAGES } from "./content";
import { useReducedMotion } from "./hooks";

// "From document to done": a connected, dimensional pipeline. Each station is drawn as an
// isometric object (document, data layers, checkpoint, client record, approval card, completed
// state). The marker travels the track to the selected station; the detail panel explains it.

const W = 1100;
const H = 420;
const STATIONS = STAGES.map((s, i) => ({ ...s, x: 110 + i * 176, y: i % 2 ? 250 : 190 }));
const TRACK = STATIONS.map((s, i) => `${i ? "L" : "M"}${s.x} ${s.y + 70}`).join(" ");

function Station({ index, active, done }: { index: number; active: boolean; done: boolean }) {
  const s = STATIONS[index];
  const accent = active ? "#3b5bff" : done ? "#5a6b9e" : "#9aa3bd";
  const face = active ? "#ffffff" : "#fbf8f2";
  const lift = active ? -14 : 0;
  // Isometric slab the object sits on.
  const slab = (
    <g>
      <path d={`M${s.x - 58} ${s.y + 70} L${s.x} ${s.y + 40} L${s.x + 58} ${s.y + 70} L${s.x} ${s.y + 100} Z`} fill={active ? "#dfe6ff" : "#ebe4d6"} />
      <path d={`M${s.x - 58} ${s.y + 70} L${s.x} ${s.y + 100} L${s.x} ${s.y + 108} L${s.x - 58} ${s.y + 78} Z`} fill={active ? "#b9c6fb" : "#d8cfbd"} />
      <path d={`M${s.x + 58} ${s.y + 70} L${s.x} ${s.y + 100} L${s.x} ${s.y + 108} L${s.x + 58} ${s.y + 78} Z`} fill={active ? "#a6b6f7" : "#cdc3af"} />
    </g>
  );
  const objects = [
    // Upload: stacked documents
    <g key="u">
      {[2, 1, 0].map((k) => (
        <g key={k} transform={`translate(${k * 6} ${-k * 6})`}>
          <path d={`M${s.x - 26} ${s.y + 52} L${s.x - 26} ${s.y - 6} L${s.x + 18} ${s.y - 22} L${s.x + 18} ${s.y + 36} Z`} fill={face} stroke="#c9bfab" />
        </g>
      ))}
      <path d={`M${s.x - 18} ${s.y + 6} L${s.x + 10} ${s.y - 4}`} stroke={accent} strokeWidth="3" />
      <path d={`M${s.x - 18} ${s.y + 18} L${s.x + 4} ${s.y + 10}`} stroke="#cfc6b4" strokeWidth="3" />
    </g>,
    // Extract: data layers lifting off a page
    <g key="e">
      {[0, 1, 2].map((k) => (
        <path key={k} d={`M${s.x - 40} ${s.y + 40 - k * 20} L${s.x} ${s.y + 20 - k * 20} L${s.x + 40} ${s.y + 40 - k * 20} L${s.x} ${s.y + 60 - k * 20} Z`} fill={k === 2 ? accent : face} fillOpacity={k === 2 ? 0.9 : 1} stroke="#c9bfab" />
      ))}
    </g>,
    // Validate: checkpoint gate
    <g key="v">
      <rect x={s.x - 34} y={s.y - 10} width="10" height="62" fill="#2a3150" />
      <rect x={s.x + 24} y={s.y - 10} width="10" height="62" fill="#2a3150" />
      <rect x={s.x - 34} y={s.y - 18} width="68" height="12" rx="3" fill={accent} />
      <circle cx={s.x} cy={s.y + 24} r="15" fill={face} stroke={accent} strokeWidth="3" />
      <path d={`M${s.x - 7} ${s.y + 24} l5 5 l9 -10`} stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>,
    // Organize: client record card
    <g key="o">
      <path d={`M${s.x - 38} ${s.y + 46} L${s.x - 38} ${s.y - 4} L${s.x + 38} ${s.y - 22} L${s.x + 38} ${s.y + 28} Z`} fill={face} stroke="#c9bfab" />
      <circle cx={s.x - 16} cy={s.y + 14} r="10" fill={accent} />
      <path d={`M${s.x} ${s.y + 8} L${s.x + 28} ${s.y + 1}`} stroke="#2a3150" strokeWidth="3" />
      <path d={`M${s.x} ${s.y + 20} L${s.x + 20} ${s.y + 15}`} stroke="#cfc6b4" strokeWidth="3" />
    </g>,
    // Approve: card with an amber approval toggle
    <g key="a">
      <path d={`M${s.x - 38} ${s.y + 46} L${s.x - 38} ${s.y - 4} L${s.x + 38} ${s.y - 22} L${s.x + 38} ${s.y + 28} Z`} fill={face} stroke="#c9bfab" />
      <rect x={s.x - 22} y={s.y + 10} width="44" height="18" rx="9" fill={active ? "#f2a83b" : "#e6c792"} transform={`skewY(-13) translate(0 ${s.x * 0.231})`} />
      <circle cx={s.x + 12} cy={s.y + 19} r="6" fill="#fff" transform={`skewY(-13) translate(0 ${s.x * 0.231})`} />
    </g>,
    // Complete: sent envelope + check
    <g key="c">
      <path d={`M${s.x - 36} ${s.y + 40} L${s.x - 36} ${s.y + 2} L${s.x + 36} ${s.y - 14} L${s.x + 36} ${s.y + 24} Z`} fill={face} stroke="#c9bfab" />
      <path d={`M${s.x - 36} ${s.y + 2} L${s.x + 2} ${s.y + 18} L${s.x + 36} ${s.y - 14}`} fill="none" stroke="#c9bfab" />
      <circle cx={s.x + 30} cy={s.y - 18} r="13" fill={done || active ? "#2fa77a" : "#b8c0d6"} />
      <path d={`M${s.x + 24} ${s.y - 18} l4 4 l8 -9`} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />
    </g>,
  ];
  return (
    <g style={{ transition: "transform 500ms cubic-bezier(.2,.7,.2,1)" }} transform={`translate(0 ${lift})`}>
      {slab}
      {objects[index]}
    </g>
  );
}

export function Workflow() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const reducedMotion = useReducedMotion();

  const go = useCallback((i: number) => setActive(((i % STAGES.length) + STAGES.length) % STAGES.length), []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setActive((a) => {
        if (a >= STAGES.length - 1) {
          setPlaying(false);
          return a;
        }
        return a + 1;
      });
    }, reducedMotion ? 3200 : 2200);
    return () => clearInterval(id);
  }, [playing, reducedMotion]);

  const stage = STAGES[active];
  const marker = STATIONS[active];
  const focus = hovered ?? active;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center">
      <div className="min-w-0">
        <div className="relative overflow-x-auto pb-2 [scrollbar-width:thin]">
          <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[760px] w-full" role="img" aria-label="Workflow diagram: upload, extract, validate, organize, approve, complete">
            {/* track */}
            <path d={TRACK} fill="none" stroke="#d8cfbd" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            {STATIONS.slice(1).map((s, i) => {
              const prev = STATIONS[i];
              const lit = i < active || i === focus || i + 1 === focus;
              return (
                <line
                  key={s.id}
                  x1={prev.x}
                  y1={prev.y + 70}
                  x2={s.x}
                  y2={s.y + 70}
                  stroke={lit ? "#3b5bff" : "transparent"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={i < active ? "0" : "6 8"}
                  style={{ transition: "stroke 400ms" }}
                />
              );
            })}
            {STATIONS.map((_, i) => (
              <Station key={i} index={i} active={i === active} done={i < active} />
            ))}
            {/* travelling marker */}
            <g style={{ transform: `translate(${marker.x}px, ${marker.y + 70}px)`, transition: reducedMotion ? "none" : "transform 700ms cubic-bezier(.65,0,.35,1)" }}>
              <circle r="12" fill="#3b5bff" opacity=".18" />
              <circle r="6" fill="#3b5bff" />
            </g>
            {STATIONS.map((s, i) => (
              <text key={s.id} x={s.x} y={s.y + 140} textAnchor="middle" className="font-sans" fontSize="17" fontWeight={i === active ? 700 : 500} fill={i === active ? "#141a2b" : "#6b6f80"}>
                {String(i + 1).padStart(2, "0")} {s.name}
              </text>
            ))}
          </svg>
        </div>

        {/* Accessible controls: one button per stage */}
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Workflow stages">
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              role="tab"
              type="button"
              id={`wf-tab-${s.id}`}
              aria-selected={i === active}
              aria-controls="wf-panel"
              onClick={() => {
                setPlaying(false);
                go(i);
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b5bff] ${i === active ? "border-[#141a2b] bg-[#141a2b] text-[#f4efe6]" : "border-[#141a2b]/15 text-[#3b4050] hover:border-[#141a2b]/40"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div id="wf-panel" role="tabpanel" aria-labelledby={`wf-tab-${stage.id}`} aria-live="polite" className="rounded-2xl border border-[#141a2b]/10 bg-white/70 p-6 shadow-[0_30px_60px_-30px_rgba(20,26,43,.35)]">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#3b5bff]">
          Step {String(active + 1).padStart(2, "0")} / {String(STAGES.length).padStart(2, "0")}
        </p>
        <h3 className="mt-2 font-display text-4xl leading-tight text-[#141a2b]">{stage.name}</h3>
        <p className="mt-1 text-sm text-[#6b6f80]">{stage.kicker}</p>
        <p className="mt-4 leading-relaxed text-[#2c3142]">{stage.body}</p>
        <ul className="mt-4 space-y-2 text-sm text-[#3b4050]">
          {stage.detail.map((d) => (
            <li key={d} className="flex gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#3b5bff]" />
              {d}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex items-center gap-2">
          <button type="button" onClick={() => { setPlaying(false); go(active - 1); }} disabled={active === 0} aria-label="Previous step" className="grid size-10 place-items-center rounded-full border border-[#141a2b]/15 transition-colors hover:bg-[#141a2b]/5 disabled:opacity-35">
            <ChevronLeftIcon className="size-4" />
          </button>
          <button type="button" onClick={() => { setPlaying(false); go(active + 1); }} disabled={active === STAGES.length - 1} aria-label="Next step" className="grid size-10 place-items-center rounded-full border border-[#141a2b]/15 transition-colors hover:bg-[#141a2b]/5 disabled:opacity-35">
            <ChevronRightIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (active === STAGES.length - 1) go(0);
              setPlaying((p) => !p);
            }}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#141a2b] px-4 py-2 text-sm font-medium text-[#f4efe6]"
          >
            {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            {playing ? "Pause" : active === STAGES.length - 1 ? "Replay" : "Play"}
          </button>
          <button type="button" onClick={() => { setPlaying(false); go(0); }} aria-label="Reset to the first step" className="grid size-10 place-items-center rounded-full border border-[#141a2b]/15 transition-colors hover:bg-[#141a2b]/5">
            <RotateCcwIcon className="size-4" />
          </button>
        </div>
        <p className="mt-5 border-t border-[#141a2b]/10 pt-4 text-xs text-[#6b6f80]">
          An illustration of the workflow — no real invoice is being processed here.
        </p>
      </div>
    </div>
  );
}
