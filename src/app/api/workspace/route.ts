import { createWorkspaceInput, updateWorkspaceInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireUser, requireWorkspace } from "@/lib/server/session";
import { createWorkspace, updateWorkspace } from "@/lib/server/services/workspace";

export const POST = handler(async (req) => {
  const user = await requireUser();
  const input = await readJson(req, createWorkspaceInput);
  const workspaceId = await createWorkspace(user, input);
  return ok({ workspaceId }, 201);
});

export const PATCH = handler(async (req) => {
  const ctx = await requireWorkspace();
  await updateWorkspace(ctx, await readJson(req, updateWorkspaceInput));
  return ok();
});
