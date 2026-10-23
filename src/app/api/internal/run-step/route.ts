import { z } from "zod";
import { assertInternalCaller } from "@/lib/server/internal-auth";
import { handler, ok, readJson } from "@/lib/server/route";
import { runStep } from "@/lib/tasks/engine";

// Called by Cloud Tasks. A 2xx tells the queue the delivery is handled; the engine records
// failures and retries on its own, so we only return 5xx for infrastructure errors.
export const POST = handler(
  async (req) => {
    await assertInternalCaller(req);
    const ref = await readJson(req, z.object({ workspaceId: z.string(), taskId: z.string(), index: z.number().int().min(0) }));
    await runStep(ref);
    return ok();
  },
  { sameOrigin: false },
);
