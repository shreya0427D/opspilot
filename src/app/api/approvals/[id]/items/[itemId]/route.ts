import { approvalItemDecisionInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { decideApprovalItem } from "@/lib/server/services/approvals";

export const POST = handler<RouteContext<"/api/approvals/[id]/items/[itemId]">>(async (req, { params }) => {
  const ctx = await requireWorkspace();
  const { id, itemId } = await params;
  return ok(await decideApprovalItem(ctx, id, itemId, await readJson(req, approvalItemDecisionInput)));
});
