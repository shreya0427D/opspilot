"use client";

import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AGENT_LINKS, AGENT_NODES, PLAYBACK, type AgentNode, type NodeId } from "./content";
import { useReducedMotion } from "./hooks";

const byId = Object.fromEntries(AGENT_NODES.map((n) => [n.id, n])) as Record<NodeId, AgentNode>;

/** Isometric node: a hexagonal prism, flat-topped, drawn in 2D. */
function NodeShape({ node, selected, related, lit }: { node: AgentNode; selected: boolean; related: boolean; lit: boolean }) {
  const r = node.kind === "core" ? 92 : node.kind === "layer" ? 84 : 98;
  const depth = node.kind === "core" ? 22 : 14;
  const pts = (cy: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${node.x + r * Math.cos(a)},${cy + r * 0.52 * Math.sin(a)}`;
    }).join(" ");
  const top = node.y - depth / 2;
  const base = node.kind === "layer" ? "#16203f" : node.kind === "core" ? "#1c2a5e" : "#131c38";
  const edge = selected ? "#f2a83b" : lit ? "#5ad1e6" : related ? "#7aa2ff" : "#2b3762";
  return (
    <g>
      <polygon points={pts(top + depth)} fill="#060a17" opacity=".9" />
      {/* side walls */}
      {Array.from({ length: 6 }, (_, i) => {
        const a1 = (Math.PI / 3) * i, a2 = (Math.PI / 3) * (i + 1);
        if (Math.sin((a1 + a2) / 2) < 0) return null; // only front-facing walls
        const p = (a: number, y: number) => `${node.x + r * Math.cos(a)},${y + r * 0.52 * Math.sin(a)}`;
        return <polygon key={i} points={`${p(a1, top)} ${p(a2, top)} ${p(a2, top + depth)} ${p(a1, top + depth)}`} fill={base} stroke="#0c1228" />;
      })}
      <polygon points={pts(top)} fill={selected ? "#22346f" : lit ? "#1e3463" : "#18244a"} stroke={edge} strokeWidth={selected || lit ? 2.5 : 1.25} style={{ transition: "all 300ms" }} />
      {node.kind === "core" && <polygon points={pts(top).split(" ").map((p) => { const [x, y] = p.split(",").map(Number); return `${node.x + (x - node.x) * 0.55},${top + (y - top) * 0.55}`; }).join(" ")} fill="none" stroke="#f2a83b" strokeOpacity=".5" />}
      <text x={node.x} y={top + 5} textAnchor="middle" fontSize={node.kind === "core" ? 18 : 14} fontWeight="600" fill="#eef1fb">
        {node.name}
      </text>
      <text x={node.x} y={top + depth + r * 0.52 + 22} textAnchor="middle" fontSize="12" fill="#8d97b5" letterSpacing="1.5" stroke="#0b1430" strokeWidth="6" paintOrder="stroke">
        {node.role.toUpperCase()}
      </text>
    </g>
  );
}

export function Agents() {
  const [selected, setSelected] = useState<NodeId>("orchestrator");
  const [step, setStep] = useState(-1); // -1 = idle
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setStep((s) => {
        if (s >= PLAYBACK.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, reducedMotion ? 2600 : 1700);
    return () => clearInterval(id);
  }, [playing, reducedMotion]);

  const current = step >= 0 ? PLAYBACK[step] : null;
  const related = useMemo(
    () => new Set(AGENT_LINKS.filter(([a, b]) => a === selected || b === selected).flatMap(([a, b]) => [a, b])),
    [selected],
  );
  const node = byId[selected];
  const token = current ? { from: byId[current.from], to: byId[current.to] } : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="relative min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <svg viewBox="0 0 1000 660" className="min-w-[680px] w-full" role="img" aria-label="Agent architecture: orchestrator connected to document, data, action and verification functions, with Gemini as the model layer and Firestore as the data layer">
          <defs>
            <pattern id="ag-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#1b2647" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="1000" height="660" fill="url(#ag-grid)" opacity=".55" />
          {AGENT_LINKS.map(([a, b]) => {
            const A = byId[a], B = byId[b];
            const isRelated = a === selected || b === selected;
            const isLive = current && ((current.from === a && current.to === b) || (current.from === b && current.to === a));
            return (
              <line
                key={`${a}-${b}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={isLive ? "#5ad1e6" : isRelated ? "#7aa2ff" : "#28345e"}
                strokeWidth={isLive ? 3 : isRelated ? 2 : 1.25}
                strokeDasharray={isLive || isRelated ? undefined : "4 6"}
                style={{ transition: "stroke 300ms" }}
              />
            );
          })}
          {AGENT_NODES.map((n) => (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`${n.name}: ${n.role}`}
              aria-pressed={selected === n.id}
              onClick={() => setSelected(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(n.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible_polygon]:stroke-[#f2a83b]"
            >
              <NodeShape node={n} selected={selected === n.id} related={related.has(n.id)} lit={!!current && (current.from === n.id || current.to === n.id)} />
            </g>
          ))}
          {token && (
            <circle
              key={step}
              r="7"
              fill="#bff1ff"
              style={{
                offsetPath: `path("M${token.from.x} ${token.from.y} L${token.to.x} ${token.to.y}")`,
                animation: reducedMotion ? undefined : "agent-token 1.3s cubic-bezier(.65,0,.35,1) forwards",
                ...(reducedMotion ? { transform: `translate(${token.to.x}px, ${token.to.y}px)` } : {}),
              }}
            />
          )}
        </svg>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6" aria-live="polite">
          <p className="text-xs uppercase tracking-[0.2em] text-[#5ad1e6]">{node.kind === "layer" ? "Platform layer" : node.kind === "core" ? "Coordinator" : "Specialist"}</p>
          <h3 className="mt-2 font-display text-3xl text-[#f4efe6]">{node.name}</h3>
          <p className="mt-1 text-sm text-[#8d97b5]">{node.role}</p>
          <p className="mt-4 leading-relaxed text-[#c9cfe0]">{node.body}</p>
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Select a component">
            {AGENT_NODES.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelected(n.id)}
                aria-pressed={selected === n.id}
                className={`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-[#f2a83b] ${selected === n.id ? "border-[#f2a83b] text-[#f2a83b]" : "border-white/15 text-[#aab3cc] hover:border-white/35"}`}
              >
                {n.name}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[#f4efe6]">Sample run: “Chase all overdue invoices”</p>
          </div>
          <ol className="mt-4 space-y-2 text-sm">
            {PLAYBACK.map((p, i) => (
              <li key={p.label} className={`flex items-center gap-3 transition-colors ${i === step ? "text-[#f4efe6]" : i < step ? "text-[#8d97b5]" : "text-[#5b6585]"}`}>
                <span className={`grid size-5 place-items-center rounded-full text-[10px] ${i < step ? "bg-[#2fa77a]/25 text-[#5ee0a8]" : i === step ? "bg-[#5ad1e6]/25 text-[#5ad1e6]" : "bg-white/5"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                {p.label}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (step >= PLAYBACK.length - 1) setStep(-1);
                setPlaying((p) => !p);
              }}
              className="inline-flex items-center gap-2 rounded-full bg-[#f4efe6] px-4 py-2 text-sm font-medium text-[#0b1430]"
            >
              {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
              {playing ? "Pause" : step >= PLAYBACK.length - 1 ? "Replay workflow" : step >= 0 ? "Resume" : "Play workflow"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                setStep(-1);
                setSelected("orchestrator");
              }}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-[#e9ecf5]"
            >
              <RotateCcwIcon className="size-4" /> Reset
            </button>
          </div>
          <p className="mt-4 text-xs text-[#6f7aa0]">Illustration with sample data. No real task runs here.</p>
        </div>
      </div>
    </div>
  );
}
