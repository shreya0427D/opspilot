import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { resumeStalledSteps } from "@/lib/tasks/engine";

export const maxDuration = 300;

/** Restarts this task's stalled steps (lost hand-offs, expired leases). Idempotent. */
export const POST = handler<RouteContext<"/api/tasks/[id]/resume">>(async (_req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  return ok({ resumed: await resumeStalledSteps(ctx.workspaceId, id) });
});
