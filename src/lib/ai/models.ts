// Model router configuration. IDs verified live via the models API on 2026-10-23.
// Prices are USD per 1M tokens (paid tier). We budget at the post-promotional rates so spend
// caps err on the safe side.
//
// `fallbackIds` are same-tier, same-price alternatives used only when the primary is overloaded
// or unreachable — never a weaker model. (On 2026-10-23 gemini-3.8-flash returned 503 "high
// demand" and timeouts in testing while gemini-3.6-flash answered in ~2.5s.)

import { ThinkingLevel } from "@google/genai";

export type ModelTier = "lite" | "standard" | "escalation";

export interface ModelConfig {
  id: string;
  fallbackIds: string[];
  inputPerM: number;
  outputPerM: number;
  timeoutMs: number;
  thinkingLevel?: ThinkingLevel;
}

export const MODELS: Record<ModelTier, ModelConfig> = {
  lite: { id: "gemini-3.5-flash-lite", fallbackIds: [], inputPerM: 0.3, outputPerM: 2.5, timeoutMs: 30_000 },
  standard: {
    id: "gemini-3.6-flash",
    fallbackIds: ["gemini-3.8-flash"],
    inputPerM: 1.5,
    outputPerM: 7.5,
    timeoutMs: 60_000,
    thinkingLevel: ThinkingLevel.LOW,
  },
  escalation: { id: "gemini-4-argon", fallbackIds: [], inputPerM: 4, outputPerM: 20, timeoutMs: 120_000 },
};

/** What each workload uses. Escalation is opt-in per call and still budget-capped. */
export const ROUTES = {
  classifyCommand: "lite",
  extractInvoice: "standard",
  personalizeReminder: "lite",
  answerDocumentQuestion: "standard",
} as const satisfies Record<string, ModelTier>;

export function costMicros(tier: ModelTier, tokensIn: number, tokensOut: number): number {
  const m = MODELS[tier];
  return Math.ceil(tokensIn * m.inputPerM + tokensOut * m.outputPerM);
}
