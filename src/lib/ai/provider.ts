import "server-only";
import { GoogleGenAI } from "@google/genai";
import { log } from "@/lib/server/log";
import { discoverKeys, type GeminiKey } from "./keys";

// Central, server-only Gemini key pool. Tracks keys that failed authentication and
// (project, model) pairs whose quota is exhausted, so no call is wasted on them until they
// recover. State is per server instance; Google still enforces quotas server-side.

const AUTH_COOLDOWN_MS = 30 * 60_000;

let pool: GeminiKey[] | null = null;
const clients = new Map<string, GoogleGenAI>();
const authFailedUntil = new Map<string, number>();
const quotaExhaustedUntil = new Map<string, number>(); // `${project}|${model}` -> epoch ms

export function keyPool(): GeminiKey[] {
  pool ??= discoverKeys(process.env);
  return pool;
}

export function clientFor(key: GeminiKey): GoogleGenAI {
  let c = clients.get(key.name);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key.value });
    clients.set(key.name, c);
  }
  return c;
}

/** First key whose own auth and whose project's quota for this model are both usable. */
export function pickKey(model: string, now = Date.now()): GeminiKey | null {
  return (
    keyPool().find(
      (k) => (authFailedUntil.get(k.name) ?? 0) <= now && (quotaExhaustedUntil.get(`${k.project}|${model}`) ?? 0) <= now,
    ) ?? null
  );
}

export function markAuthFailure(key: GeminiKey, reason: string) {
  authFailedUntil.set(key.name, Date.now() + AUTH_COOLDOWN_MS);
  log.warn("Gemini key rejected; skipping it", { key: key.name, reason });
}

/** Marks the whole project (every key in it) exhausted for this model until the retry time. */
export function markQuotaExhausted(key: GeminiKey, model: string, retryAfterMs: number, quotaId: string | null) {
  quotaExhaustedUntil.set(`${key.project}|${model}`, Date.now() + retryAfterMs);
  log.warn("Gemini quota exhausted for project", { project: key.project, model, quotaId, retryAfterSec: Math.round(retryAfterMs / 1000) });
}

/** Why no key is usable for a model right now: soonest quota recovery, or every key rejected. */
export function unavailability(models: string[], now = Date.now()): { quotaRetryAfterMs: number | null; allKeysRejected: boolean } {
  const keys = keyPool();
  const allKeysRejected = keys.length === 0 || keys.every((k) => (authFailedUntil.get(k.name) ?? 0) > now);
  let soonest: number | null = null;
  for (const k of keys) {
    for (const m of models) {
      const until = quotaExhaustedUntil.get(`${k.project}|${m}`) ?? 0;
      if (until > now) soonest = soonest === null ? until - now : Math.min(soonest, until - now);
    }
  }
  return { quotaRetryAfterMs: soonest, allKeysRejected };
}

/** Test hook. */
export function resetProviderState() {
  pool = null;
  clients.clear();
  authFailedUntil.clear();
  quotaExhaustedUntil.clear();
}
