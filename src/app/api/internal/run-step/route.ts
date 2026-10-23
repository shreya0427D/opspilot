import { after } from "next/server";
import { z } from "zod";
import { assertInternalCaller } from "@/lib/server/internal-auth";
import { handler, ok, readJson } from "@/lib/server/route";
import { ASYNC_DISPATCH_HEADER } from "@/lib/tasks/dispatch";
import { runStep } from "@/lib/tasks/engine";

// Long enough for the slowest step (5 min timeout) plus bookkeeping.
export const maxDuration = 300;

// Called by Cloud Tasks (synchronously, so the queue sees failures) or by our own HTTP
// dispatcher on serverless hosts (acknowledged at once; the step runs in after()).
// The engine records failures and retries on its own.
export const POST = handler(
  async (req) => {
    await assertInternalCaller(req);
    const ref = await readJson(req, z.object({ workspaceId: z.string(), taskId: z.string(), index: z.number().int().min(0) }));
    if (req.headers.get(ASYNC_DISPATCH_HEADER)) {
      after(() => runStep(ref));
      return ok({ accepted: true }, 202);
    }
    await runStep(ref);
    return ok();
  },
  { sameOrigin: false },
);
