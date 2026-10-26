"use client";

import { useMemo, useState } from "react";
import { AGENT_LINKS, AGENT_NODES, PLAYBACK, type AgentNode, type NodeId } from "./content";
import { useAutoCycle, useHold, useReducedMotion } from "./hooks";

/** Fixed precision so server and client render identical SVG coordinates (avoids hydration mismatches). */
const f2 = (n: number) => Math.round(n * 100) / 100;

const byId = Object.fromEntries(AGENT_NODES.map((n) => [n.id, n])) as Record<NodeId, AgentNode>;

const C = {
  gold: "#b89150",
  goldLight: "#d9be85",
  slate: "#8fa3bc",
  wire: "#33475f",
  top: "#24354b",
  topLit: "#2c4160",
  side: "#1b2a3c",
  shadow: "#0f1823",
  text: "#fffcf6",
  mist: "#b9c4d2",
};

/** Isometric node: a flat-topped hexagonal prism, drawn in 2D. */
function NodeShape({ node, selected, related, lit }: { node: AgentNode; selected: boolean; related: boolean; lit: boolean }) {
  const r = node.kind === "core" ? 92 : node.kind === "layer" ? 86 : 96;
  const depth = node.kind === "core" ? 22 : 14;
  const pts = (cy: number, scale = 1) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${f2(node.x + r * scale * Math.cos(a))},${f2(cy + r * scale * 0.52 * Math.sin(a))}`;
    }).join(" ");
  const top = node.y - depth / 2;
  const edge = selected ? C.gold : lit ? C.goldLight : related ? C.slate : C.wire;
  const name = node.name.length > 18 ? node.name.split(" & ") : [node.name];
  return (
    <g>
      <title>{`${node.name} — ${node.role}`}</title>
      <polygon points={pts(top + depth + 6)} fill={C.shadow} opacity=".75" />
      {/* side walls */}
      {Array.from({ length: 6 }, (_, i) => {
        const a1 = (Math.PI / 3) * i,
          a2 = (Math.PI / 3) * (i + 1);
        if (Math.sin((a1 + a2) / 2) < 0) return null; // only front-facing walls
        const p = (a: number, y: number) => `${f2(node.x + r * Math.cos(a))},${f2(y + r * 0.52 * Math.sin(a))}`;
        return <polygon key={i} points={`${p(a1, top)} ${p(a2, top)} ${p(a2, top + depth)} ${p(a1, top + depth)}`} fill={selected ? "#5c4a28" : C.side} stroke={C.shadow} />;
      })}
      <polygon points={pts(top)} fill={selected || lit ? C.topLit : C.top} stroke={edge} strokeWidth={selected || lit ? 2.5 : 1.25} style={{ transition: "all 300ms" }} />
      {node.kind === "core" && <polygon points={pts(top, 0.58)} fill="none" stroke={C.gold} strokeOpacity=".6" />}
      {node.kind === "layer" && <polygon points={pts(top, 0.82)} fill="none" stroke={C.slate} strokeOpacity=".35" strokeDasharray="3 4" />}
      <text x={node.x} y={top + (name.length > 1 ? -3 : 5)} textAnchor="middle" fontSize={node.kind === "core" ? 18 : 14} fontWeight="600" fill={C.text}>
        {name.map((line, i) => (
          <tspan key={line} x={node.x} dy={i ? 17 : 0}>
            {i ? `& ${line}` : line}
          </tspan>
        ))}
      </text>
      <text x={node.x} y={top + depth + r * 0.52 + 22} textAnchor="middle" fontSize="11" fill={selected ? C.goldLight : C.mist} letterSpacing="1.6" stroke="#172230" strokeWidth="6" paintOrder="stroke">
        {node.role.toUpperCase()}
      </text>
    </g>
  );
}

const BEAT_MS = 2600;

export function Agents() {
  const [selected, setSelected] = useState<NodeId | null>(null);
  const { held, hold, focusProps } = useHold();
  const reducedMotion = useReducedMotion();
  // The sample run loops forever; picking a component (or keyboard focus) holds it briefly to read.
  const { ref, index: step } = useAutoCycle<HTMLDivElement>(PLAYBACK.length, reducedMotion ? BEAT_MS * 2 : BEAT_MS, held);
  const pick = (id: NodeId) => {
    setSelected(id);
    hold();
  };

  const current = PLAYBACK[step];
  // The panel follows the component receiving the work, unless the visitor picked one to read.
  const shown: NodeId = held && selected ? selected : current.to;
  const related = useMemo(
    () => new Set(AGENT_LINKS.filter(([a, b]) => a === shown || b === shown).flatMap(([a, b]) => [a, b])),
    [shown],
  );
  const node = byId[shown];
  const token = { from: byId[current.from], to: byId[current.to] };

  return (
    <div
      ref={ref}
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
      {...focusProps}
    >
      <div className="relative min-w-0 overflow-x-auto [scrollbar-width:thin]">
        <svg viewBox="0 0 1000 720" className="w-full min-w-[680px]" role="group" aria-label="Agent architecture: the orchestrator connected to document intelligence, research, data analysis, action execution and verification, with Gemini as the model layer and Firebase as the data layer">
          <defs>
            <pattern id="ag-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="#24354b" strokeWidth="1" />
            </pattern>
            <marker id="ag-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill={C.goldLight} />
            </marker>
          </defs>
          <rect width="1000" height="720" fill="url(#ag-grid)" opacity=".6" />
          {/* layer bands */}
          {[70, 650].map((y) => (
            <line key={y} x1="40" x2="960" y1={y} y2={y} stroke={C.gold} strokeOpacity=".18" strokeDasharray="2 8" />
          ))}
          {AGENT_LINKS.map(([a, b]) => {
            const A = byId[a],
              B = byId[b];
            const isRelated = a === shown || b === shown;
            const isLive = (current.from === a && current.to === b) || (current.from === b && current.to === a);
            const forward = current.from === a;
            return (
              <line
                key={`${a}-${b}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={isLive ? C.goldLight : isRelated ? C.slate : C.wire}
                strokeWidth={isLive ? 3 : isRelated ? 2 : 1.25}
                strokeDasharray={isLive || isRelated ? undefined : "4 6"}
                markerEnd={isLive && forward ? "url(#ag-arrow)" : undefined}
                markerStart={isLive && !forward ? "url(#ag-arrow)" : undefined}
                style={{ transition: "stroke 600ms ease, stroke-width 600ms ease" }}
              />
            );
          })}
          {AGENT_NODES.map((n) => (
            <g
              key={n.id}
              role="button"
              tabIndex={0}
              aria-label={`${n.name}: ${n.role}`}
              aria-pressed={shown === n.id}
              onClick={() => pick(n.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  pick(n.id);
                }
              }}
              className="cursor-pointer outline-none [&:focus-visible_polygon]:stroke-[#d9be85]"
            >
              <NodeShape node={n} selected={shown === n.id} related={related.has(n.id)} lit={current.from === n.id || current.to === n.id} />
            </g>
          ))}
          <circle
            key={step}
            r="7"
            fill={C.goldLight}
            stroke="#fffcf6"
            strokeWidth="2"
            style={{
              offsetPath: `path("M${token.from.x} ${token.from.y} L${token.to.x} ${token.to.y}")`,
              animation: reducedMotion ? undefined : "agent-token 1.3s cubic-bezier(.65,0,.35,1) forwards",
              ...(reducedMotion ? { transform: `translate(${token.to.x}px, ${token.to.y}px)` } : {}),
            }}
          />
        </svg>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-lx-mist">
          <span className="flex items-center gap-2"><span className="h-px w-6 bg-lx-gold-light" /> Active path</span>
          <span className="flex items-center gap-2"><span className="h-px w-6 bg-[#8fa3bc]" /> Connected</span>
          <span className="flex items-center gap-2"><span className="h-px w-6 border-t border-dashed border-[#5a6e86]" /> Other links</span>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <div className="relative border border-white/10 bg-lx-sapphire/50 p-6">
          <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-lx-gold via-lx-gold/60 to-transparent" />
          <div key={shown} className="lx-fade-in">
            <p className="text-[11px] uppercase tracking-[0.22em] text-lx-gold-light">
              {node.kind === "layer" ? "Platform layer" : node.kind === "core" ? "Coordinator" : "Specialist"}
            </p>
            <h3 className="mt-2 font-display text-3xl text-lx-porcelain">{node.name}</h3>
            <p className="mt-1 text-sm text-lx-mist">{node.role}</p>
            <p className="mt-4 leading-relaxed text-[#dfe5ec]">{node.body}</p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Select a component">
            {AGENT_NODES.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => pick(n.id)}
                aria-pressed={shown === n.id}
                className={`rounded-full border px-3 py-1 text-xs transition-colors duration-500 focus-visible:outline-2 focus-visible:outline-lx-gold-light ${shown === n.id ? "border-lx-gold text-lx-gold-light" : "border-white/15 text-lx-mist hover:border-white/40"}`}
              >
                {n.name}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-white/10 bg-lx-sapphire/30 p-6">
          <p className="text-sm font-medium text-lx-porcelain">Sample run: “Chase all overdue invoices”</p>
          <ol className="mt-4 space-y-2 text-sm">
            {PLAYBACK.map((p, i) => (
              <li key={p.label} aria-current={i === step ? "step" : undefined} className={`flex items-center gap-3 transition-colors duration-500 ${i === step ? "text-lx-porcelain" : i < step ? "text-lx-mist" : "text-[#7f8ea2]"}`}>
                <span className={`grid size-5 place-items-center rounded-full text-[10px] transition-colors duration-500 ${i < step ? "bg-[#8cc3a0]/20 text-[#a9d6b8]" : i === step ? "bg-lx-gold/25 text-lx-gold-light" : "bg-white/5"}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                {p.label}
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-lx-mist">Every component shown exists in OpsPilot. This run plays on its own as a simulation with sample data — no real task runs here.</p>
        </div>
      </div>
    </div>
  );
}
