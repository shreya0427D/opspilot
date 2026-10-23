import { clientInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { deleteClient, updateClient } from "@/lib/server/services/records";

export const PUT = handler<RouteContext<"/api/clients/[id]">>(async (req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  await updateClient(ctx, id, await readJson(req, clientInput));
  return ok();
});

export const DELETE = handler<RouteContext<"/api/clients/[id]">>(async (_req, { params }) => {
  const ctx = await requireWorkspace();
  const { id } = await params;
  await deleteClient(ctx, id);
  return ok();
});
