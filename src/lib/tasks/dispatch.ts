import "server-only";
import type { CloudTasksClient } from "@google-cloud/tasks";
import { after } from "next/server";
import { env } from "@/lib/env";
import { log } from "@/lib/server/log";

export interface StepRef {
  workspaceId: string;
  taskId: string;
  index: number;
}

/** Header that tells /api/internal/run-step to acknowledge immediately and work in after(). */
export const ASYNC_DISPATCH_HEADER = "x-opspilot-async";

type Mode = "cloud-tasks" | "http" | "inline";

/**
 * - cloud-tasks: Firebase App Hosting / Cloud Run. Durable queue with OIDC-authenticated delivery.
 * - http: serverless hosts without a queue (Vercel). Each step runs in its own invocation,
 *   triggered by an authenticated request to our own run-step endpoint.
 * - inline: local development. In-process timer.
 * In every mode the engine's lease makes duplicate deliveries harmless, and the recovery sweep
 * re-dispatches anything that gets lost.
 */
function mode(): Mode {
  if (env().TASKS_QUEUE) return "cloud-tasks";
  if (process.env.VERCEL) return "http";
  return "inline";
}

let tasksClient: CloudTasksClient | null = null;

/** Runs the step in this server invocation after the response (serverless-safe). */
function runInline(ref: StepRef, delayMs: number) {
  after(async () => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const { runStep } = await import("./engine");
    await runStep(ref).catch((err) => log.error("Inline step execution failed", { ...ref, err }));
  });
}

export async function dispatchStep(ref: StepRef, delayMs = 0, opts: { preferInline?: boolean } = {}): Promise<void> {
  const { TASKS_QUEUE, TASKS_INVOKER_SA, NEXT_PUBLIC_APP_URL, CRON_SECRET } = env();

  switch (mode()) {
    case "inline":
      setTimeout(() => {
        import("./engine")
          .then(({ runStep }) => runStep(ref))
          .catch((err) => log.error("Inline step execution failed", { ...ref, err }));
      }, delayMs);
      return;

    case "http": {
      // A user-triggered resume runs the step right here rather than relying on another hand-off.
      if (opts.preferInline || !CRON_SECRET) {
        if (!CRON_SECRET) log.warn("CRON_SECRET missing; running step inline", { ...ref });
        runInline(ref, delayMs);
        return;
      }
      const send = async () => {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        const res = await fetch(`${NEXT_PUBLIC_APP_URL}/api/internal/run-step`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${CRON_SECRET}`, [ASYNC_DISPATCH_HEADER]: "1" },
          body: JSON.stringify(ref),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) throw new Error(`run-step dispatch returned ${res.status}`);
      };
      // If the hand-off to a new invocation fails (blocked, timed out, rejected), run the step
      // in this invocation instead so the task never sits in "queued".
      const handOff = () =>
        send().catch((err) => {
          log.warn("Step hand-off failed; running inline", { ...ref, err });
          runInline(ref, 0);
        });
      if (delayMs) after(handOff);
      else await handOff();
      return;
    }

    case "cloud-tasks": {
      // Loaded lazily: the client reads a proto JSON file at import time, which serverless
      // file tracing can miss — importing it eagerly crashed every API route on Vercel.
      if (!tasksClient) {
        const { CloudTasksClient } = await import("@google-cloud/tasks");
        tasksClient = new CloudTasksClient();
      }
      const body = Buffer.from(JSON.stringify(ref)).toString("base64");
      await tasksClient.createTask({
        parent: TASKS_QUEUE,
        task: {
          httpRequest: {
            httpMethod: "POST",
            url: `${NEXT_PUBLIC_APP_URL}/api/internal/run-step`,
            headers: { "Content-Type": "application/json" },
            body,
            oidcToken: { serviceAccountEmail: TASKS_INVOKER_SA, audience: NEXT_PUBLIC_APP_URL },
          },
          dispatchDeadline: { seconds: 600 },
          ...(delayMs > 0 ? { scheduleTime: { seconds: Math.floor((Date.now() + delayMs) / 1000) } } : {}),
        },
      });
    }
  }
}
