import "server-only";
import { CloudTasksClient } from "@google-cloud/tasks";
import { env } from "@/lib/env";
import { log } from "@/lib/server/log";

export interface StepRef {
  workspaceId: string;
  taskId: string;
  index: number;
}

let tasksClient: CloudTasksClient | null = null;

/**
 * Hands a step to the executor. Production: Cloud Tasks (durable, survives deploys, OIDC-authenticated).
 * Local: in-process timer. Either way, the engine's lease makes duplicate deliveries harmless,
 * and the recovery sweep re-dispatches anything that gets lost.
 */
export async function dispatchStep(ref: StepRef, delayMs = 0): Promise<void> {
  const { TASKS_QUEUE, TASKS_INVOKER_SA, NEXT_PUBLIC_APP_URL } = env();

  if (!TASKS_QUEUE) {
    setTimeout(() => {
      import("./engine")
        .then(({ runStep }) => runStep(ref))
        .catch((err) => log.error("Inline step execution failed", { ...ref, err }));
    }, delayMs);
    return;
  }

  tasksClient ??= new CloudTasksClient();
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
