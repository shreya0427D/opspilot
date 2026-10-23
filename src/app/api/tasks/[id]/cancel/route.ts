import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { requestCancel } from "@/lib/tasks/engine";

export const POST = handler<RouteContext<"/api/tasks/[id]/cancel">>(async (_req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  await requestCancel(ctx.workspaceId, id, ctx.uid);
  return ok();
});
