import "server-only";
import { z } from "zod";
import { classifyCommand } from "@/lib/ai/prompts";
import { buildPlan, UNSUPPORTED_MESSAGE, type PlanParams } from "../plans";
import { registerTool } from "../registry";

registerTool({
  name: "plan",
  lane: "orchestrator",
  permission: "read",
  maxAttempts: 3,
  argsSchema: z.object({}),
  async run(ctx) {
    let intent = ctx.task.intent;
    let params = ctx.task.params as PlanParams;
    let costMicros = 0;

    // System-triggered tasks (uploads, daily check) arrive with a known intent. Typed commands
    // are classified by the lite model into one of the fixed intents.
    if (!intent) {
      const { data, costMicros: cost } = await classifyCommand(ctx.workspaceId, ctx.task.command);
      intent = data.intent;
      params = { ...params, clientName: data.clientName, invoiceNumber: data.invoiceNumber, question: data.question };
      costMicros = cost;
    }

    const steps = buildPlan(intent, params);
    if (steps.length === 0) {
      return { output: { intent, params }, costMicros, summary: UNSUPPORTED_MESSAGE, finalStatus: "failed" };
    }
    return {
      output: { intent, params, plan: steps.map((s) => s.label) },
      appendSteps: steps,
      costMicros,
      summary: `Plan: ${steps.map((s) => s.label).join(" → ")}`,
    };
  },
});
