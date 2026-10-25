"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the visitor asked for reduced motion. False during SSR. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(MOTION_QUERY).matches, () => false);
}

/**
 * Writes how far an element has travelled through the viewport (0 → 1) to a CSS variable on it,
 * without re-rendering React. 0 = its top reaches the bottom of the viewport, 1 = its top
 * reaches the top.
 */
export function useScrollVar<T extends HTMLElement>(name = "--progress"): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const p = Math.min(1, Math.max(0, (vh - rect.top) / vh));
      el.style.setProperty(name, p.toFixed(4));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [name]);
  return ref;
}
