import "server-only";
import type { ZodType } from "zod";
import type { Step, StepLane, Task, TaskReport } from "@/lib/domain/types";

// Allowlisted tools. The planner can only reference names in this registry, and arguments are
// validated against each tool's schema before execution.

export type ToolPermission = "read" | "draft" | "write_internal" | "external";

export interface ToolContext {
  workspaceId: string;
  taskId: string;
  task: Task;
  step: Step;
  /** Outputs of the steps this step depends on, keyed by step index. */
  deps: Record<number, Record<string, unknown>>;
}

export interface ToolResult {
  output: Record<string, unknown>;
  verification?: "pass" | "fail" | "needs_review";
  /** Ends the automatic run and parks the task until a person acts. */
  pause?: "awaiting_approval";
  /** Additional steps to append (only the planner uses this). */
  appendSteps?: NewStep[];
  /** Overrides the task summary shown to the user. */
  summary?: string;
  /** Marks the whole task's final status explicitly (used by report/terminal steps). */
  finalStatus?: "succeeded" | "partially_succeeded" | "failed";
  costMicros?: number;
  /** Evidence-based final report: what was verified, failed, skipped or needs a person. */
  report?: TaskReport;
}

export interface ToolDef<A = Record<string, unknown>> {
  name: string;
  lane: StepLane;
  permission: ToolPermission;
  argsSchema: ZodType<A>;
  maxAttempts: number;
  run(ctx: ToolContext, args: A): Promise<ToolResult>;
}

export interface NewStep {
  tool: string;
  label: string;
  args: Record<string, unknown>;
  dependsOn: number[];
  /** "succeeded" (default): run only if every dependency succeeded. "settled": run once they all finish. */
  dependMode?: "succeeded" | "settled";
}

const tools = new Map<string, ToolDef<never>>();

export function registerTool<A>(def: ToolDef<A>) {
  tools.set(def.name, def as unknown as ToolDef<never>);
}

export function getTool(name: string): ToolDef<Record<string, unknown>> | undefined {
  return tools.get(name) as unknown as ToolDef<Record<string, unknown>> | undefined;
}
