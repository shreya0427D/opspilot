import { approvalDecisionInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { decideApproval } from "@/lib/server/services/approvals";

export const POST = handler<RouteContext<"/api/approvals/[id]">>(async (req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  return ok(await decideApproval(ctx, id, await readJson(req, approvalDecisionInput)));
});
