import { paymentDecisionInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { decidePayment } from "@/lib/server/services/records";

export const POST = handler<RouteContext<"/api/payments/[id]">>(async (req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  const { decision, invoiceId } = await readJson(req, paymentDecisionInput);
  await decidePayment(ctx, id, decision, invoiceId);
  return ok();
});
