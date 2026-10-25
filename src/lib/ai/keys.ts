// Pure helpers for the Gemini key pool (no SDK, no secrets logged) so they can be unit-tested.
//
// Quotas are enforced per Google Cloud project (and per model), not per key. Keys are therefore
// grouped by project: an exhausted project is skipped as a whole, and we only fall back to a key
// in a *different, declared* project. Without GEMINI_KEY_PROJECTS every key is assumed to share
// one project, so quota exhaustion never causes rotation to sibling keys.

export interface GeminiKey {
  /** Env var name, safe to log. */
  name: string;
  /** Project label from GEMINI_KEY_PROJECTS (or "default"). Safe to log. */
  project: string;
  /** The secret. Never log or return it. */
  value: string;
}

const KEY_NAME = /^GEMINI_API_KEY(?:_(\d+))?$/;

/**
 * Finds GEMINI_API_KEY and GEMINI_API_KEY_<n> in order (unnumbered first, then by number),
 * skipping empty and duplicate values.
 * GEMINI_KEY_PROJECTS maps keys to projects: "1=billing-proj,2=billing-proj,3=other-proj"
 * (numbers or full env var names).
 */
export function discoverKeys(source: Record<string, string | undefined>): GeminiKey[] {
  const projectOf = new Map<string, string>();
  for (const pair of (source.GEMINI_KEY_PROJECTS ?? "").split(",")) {
    const [k, v] = pair.split("=").map((s) => s?.trim());
    if (!k || !v) continue;
    projectOf.set(/^\d+$/.test(k) ? `GEMINI_API_KEY_${k}` : k, v);
  }
  const seen = new Set<string>();
  return Object.keys(source)
    .filter((name) => KEY_NAME.test(name))
    .sort((a, b) => Number(a.match(KEY_NAME)![1] ?? -1) - Number(b.match(KEY_NAME)![1] ?? -1))
    .flatMap((name) => {
      const value = source[name]?.trim().replace(/^"|"$/g, "");
      if (!value || value.length < 20 || seen.has(value)) return [];
      seen.add(value);
      return [{ name, project: projectOf.get(name) ?? "default", value }];
    });
}

export type GeminiFailure =
  | { kind: "quota"; retryAfterMs: number; quotaId: string | null }
  | { kind: "auth"; reason: string }
  | { kind: "transient"; status: number | null }
  | { kind: "fatal"; status: number | null };

/** Classifies an SDK/network error by its actual status code and Google error details. */
export function classifyGeminiError(err: unknown): GeminiFailure {
  const e = err as { status?: number; name?: string; message?: string; cause?: unknown };
  const status = typeof e?.status === "number" ? e.status : null;
  const text = String(e?.message ?? "");

  if (e?.name === "TimeoutError" || e?.name === "AbortError") return { kind: "transient", status: null };
  if (status === null && /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(text)) {
    return { kind: "transient", status: null };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED/.test(text)) {
    const delay = text.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
    const quotaId = text.match(/"quotaId"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    return { kind: "quota", retryAfterMs: delay ? Math.ceil(Number(delay[1]) * 1000) : 60_000, quotaId };
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED/.test(text)) {
    const reason = text.match(/API_KEY_INVALID|API_KEY_SERVICE_BLOCKED|SERVICE_DISABLED|PERMISSION_DENIED/)?.[0] ?? `HTTP ${status}`;
    return { kind: "auth", reason };
  }
  if (status !== null && [408, 500, 502, 503, 504].includes(status)) return { kind: "transient", status };
  return { kind: "fatal", status };
}
