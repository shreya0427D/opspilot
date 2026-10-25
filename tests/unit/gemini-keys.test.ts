import { afterEach, describe, expect, it } from "vitest";
import { classifyGeminiError, discoverKeys } from "@/lib/ai/keys";
import { markAuthFailure, markQuotaExhausted, pickKey, resetProviderState, unavailability } from "@/lib/ai/provider";

const k = (n: number) => `test-key-value-number-${n}-xxxxxxxxxxxxxxxxxxxxxxxx`;

describe("key discovery", () => {
  it("finds GEMINI_API_KEY and numbered keys in order, skipping blanks and duplicates", () => {
    const keys = discoverKeys({
      GEMINI_API_KEY_10: k(10),
      GEMINI_API_KEY_2: k(2),
      GEMINI_API_KEY: k(0),
      GEMINI_API_KEY_1: k(1),
      GEMINI_API_KEY_3: "",
      GEMINI_API_KEY_4: k(1), // duplicate value
      OTHER: k(9),
    });
    expect(keys.map((x) => x.name)).toEqual(["GEMINI_API_KEY", "GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY_10"]);
    expect(keys.every((x) => x.project === "default")).toBe(true);
  });

  it("reads declared projects", () => {
    const keys = discoverKeys({ GEMINI_API_KEY_1: k(1), GEMINI_API_KEY_2: k(2), GEMINI_KEY_PROJECTS: "1=billing, GEMINI_API_KEY_2=backup" });
    expect(keys.map((x) => x.project)).toEqual(["billing", "backup"]);
  });
});

describe("error classification", () => {
  it("reads the retry delay and quota id from a 429", () => {
    const err = Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},{"retryDelay":"38397s"}]}}'), { status: 429 });
    expect(classifyGeminiError(err)).toEqual({ kind: "quota", retryAfterMs: 38_397_000, quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" });
  });

  it("separates invalid keys, transient failures and fatal errors", () => {
    expect(classifyGeminiError(Object.assign(new Error("API key not valid. API_KEY_INVALID"), { status: 400 }))).toMatchObject({ kind: "auth" });
    expect(classifyGeminiError(Object.assign(new Error("denied"), { status: 403 }))).toMatchObject({ kind: "auth" });
    expect(classifyGeminiError(Object.assign(new Error("overloaded"), { status: 503 }))).toEqual({ kind: "transient", status: 503 });
    expect(classifyGeminiError(Object.assign(new Error("t"), { name: "TimeoutError" }))).toMatchObject({ kind: "transient" });
    expect(classifyGeminiError(new TypeError("fetch failed"))).toMatchObject({ kind: "transient" });
    expect(classifyGeminiError(Object.assign(new Error("bad schema"), { status: 400 }))).toEqual({ kind: "fatal", status: 400 });
  });
});

describe("key selection", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    resetProviderState();
  });

  function useKeys(env: Record<string, string>) {
    for (const name of Object.keys(process.env)) if (name.startsWith("GEMINI_")) delete process.env[name];
    Object.assign(process.env, env);
    resetProviderState();
  }

  it("never rotates to sibling keys of an exhausted project", () => {
    useKeys({ GEMINI_API_KEY_1: k(1), GEMINI_API_KEY_2: k(2), GEMINI_API_KEY_3: k(3) });
    markQuotaExhausted(pickKey("m1")!, "m1", 3_600_000, "PerDay");
    expect(pickKey("m1")).toBeNull();
    expect(unavailability(["m1"]).quotaRetryAfterMs).toBeGreaterThan(3_500_000);
    expect(pickKey("m2")?.name).toBe("GEMINI_API_KEY_1"); // a different model has its own quota
  });

  it("falls back to a key in a different declared project", () => {
    useKeys({ GEMINI_API_KEY_1: k(1), GEMINI_API_KEY_2: k(2), GEMINI_KEY_PROJECTS: "1=a,2=b" });
    markQuotaExhausted(pickKey("m1")!, "m1", 60_000, null);
    expect(pickKey("m1")?.name).toBe("GEMINI_API_KEY_2");
  });

  it("skips a rejected key and reports when every key is rejected", () => {
    useKeys({ GEMINI_API_KEY_1: k(1), GEMINI_API_KEY_2: k(2) });
    markAuthFailure(pickKey("m1")!, "API_KEY_INVALID");
    expect(pickKey("m1")?.name).toBe("GEMINI_API_KEY_2");
    markAuthFailure(pickKey("m1")!, "API_KEY_INVALID");
    expect(pickKey("m1")).toBeNull();
    expect(unavailability(["m1"]).allKeysRejected).toBe(true);
  });
});
