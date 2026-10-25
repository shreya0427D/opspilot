"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "./hooks";

const HeroScene = dynamic(() => import("./hero-scene"), { ssr: false });

class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Static drawing of the same console + sheets, used while loading and when WebGL is unavailable. */
export function HeroIllustration({ note }: { note?: string }) {
  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 800 560" className="h-full w-full" role="img" aria-label="Illustration of the OpsPilot console with invoice sheets">
        <defs>
          <linearGradient id="hi-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2a3150" />
            <stop offset="1" stopColor="#121726" />
          </linearGradient>
        </defs>
        <g transform="translate(70 120) rotate(-8)">
          <rect width="150" height="200" rx="4" fill="#f6f1e7" />
          <rect x="18" y="24" width="70" height="10" fill="#1a1f2e" />
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x="18" y={56 + i * 20} width={i % 2 ? 80 : 112} height="6" fill="#ddd4c4" />
          ))}
        </g>
        <g transform="translate(590 170) rotate(7)">
          <rect width="150" height="200" rx="4" fill="#f6f1e7" />
          <rect x="18" y="24" width="70" height="10" fill="#1a1f2e" />
          <g transform="translate(75 110) rotate(-16)">
            <rect x="-42" y="-18" width="84" height="36" fill="none" stroke="#d24b3e" strokeWidth="4" />
            <text x="0" y="9" textAnchor="middle" fontSize="24" fontWeight="800" fill="#d24b3e" fontFamily="system-ui">PAID</text>
          </g>
        </g>
        <rect x="190" y="120" width="420" height="270" rx="16" fill="url(#hi-metal)" />
        <rect x="202" y="132" width="396" height="246" rx="8" fill="#0b0d14" />
        <rect x="202" y="132" width="80" height="246" fill="#0f121b" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={298 + i * 98} y="164" width="88" height="56" rx="6" fill="#131726" />
        ))}
        <rect x="298" y="232" width="284" height="132" rx="6" fill="#131726" />
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <circle cx="314" cy={254 + i * 28} r="6" fill={i < 3 ? "#34d399" : "#f2a83b"} opacity=".8" />
            <rect x="328" y={250 + i * 28} width={150 - i * 12} height="7" rx="3" fill="#2a3354" />
          </g>
        ))}
        <rect x="370" y="392" width="60" height="44" fill="#1d2335" />
        <ellipse cx="400" cy="444" rx="110" ry="10" fill="#1a2033" />
      </svg>
      {note && <p className="absolute inset-x-0 top-2 text-center text-xs tracking-wide text-[#8d97b5]">{note}</p>}
    </div>
  );
}

export function HeroVisual() {
  const reducedMotion = useReducedMotion();
  const [support, setSupport] = useState<"checking" | "webgl" | "none">("checking");
  const [ready, setReady] = useState(false);
  const [compact, setCompact] = useState(false);
  const dragRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Browser-only capability checks; run once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(webglAvailable() ? "webgl" : "none");
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      mq.removeEventListener("change", apply);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  // Drag to inspect: horizontal drag spins, vertical drag tilts (clamped).
  useEffect(() => {
    const el = box.current;
    if (!el || support !== "webgl") return;
    let start: { x: number; y: number; dx: number; dy: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch") return; // keep vertical page scrolling on touch
      start = { x: e.clientX, y: e.clientY, dx: dragRef.current.x, dy: dragRef.current.y };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!start) return;
      dragRef.current = {
        x: start.dx + (e.clientX - start.x) * 0.006,
        y: Math.max(-0.5, Math.min(0.5, start.dy + (e.clientY - start.y) * 0.004)),
      };
    };
    const up = () => {
      start = null;
      el.style.cursor = "grab";
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [support]);

  const fallback = <HeroIllustration note="Interactive 3D isn't available in this browser" />;

  return (
    <div
      ref={box}
      className="relative h-full w-full select-none"
      style={{ cursor: support === "webgl" ? "grab" : undefined, touchAction: "pan-y" }}
      aria-label="Interactive 3D model of the OpsPilot console. Drag to rotate."
      role="img"
    >
      {support === "none" ? (
        fallback
      ) : (
        <>
          <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`} aria-hidden={ready}>
            <HeroIllustration note={support === "checking" || !ready ? "Loading 3D model…" : undefined} />
          </div>
          {support === "webgl" && (
            <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
              <SceneBoundary fallback={fallback}>
                <HeroScene reducedMotion={reducedMotion} compact={compact} dragRef={dragRef} pointerRef={pointerRef} onReady={() => setReady(true)} />
              </SceneBoundary>
            </div>
          )}
        </>
      )}
    </div>
  );
}
