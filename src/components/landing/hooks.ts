"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

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

/**
 * Advances an index 0 → length-1 and back to 0 on a fixed beat, forever. Pauses while the element
 * is off-screen (no work for unseen sections) and while `paused` is true (e.g. the visitor is
 * hovering or focusing inside it, so they can read). Visual demonstration only.
 */
export function useAutoCycle<T extends HTMLElement>(length: number, intervalMs: number, paused = false) {
  const ref = useRef<T>(null);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || paused || length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs);
    return () => clearInterval(id);
  }, [visible, paused, length, intervalMs]);
  return { ref, index, setIndex };
}

/**
 * A temporary hold for auto-cycling demos: `hold()` pauses for `ms` (restarting the timer on each
 * call), and keyboard focus inside the container pauses until focus leaves. Plain hovering does not
 * pause, so the demo keeps running while people read.
 */
export function useHold(ms = 8000) {
  const [timed, setTimed] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const hold = () => {
    setTimed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setTimed(false), ms);
  };
  const focusProps = {
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).matches(":focus-visible")) setKeyboard(true);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setKeyboard(false);
    },
  };
  return { held: timed || keyboard, hold, focusProps };
}
