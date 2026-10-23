import { createTaskInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { createTask } from "@/lib/tasks/engine";

export const POST = handler(async (req) => {
  const ctx = await requireWorkspace();
  const { command, submissionKey } = await readJson(req, createTaskInput);
  const { taskId, created } = await createTask({
    workspaceId: ctx.workspaceId,
    actorUid: ctx.uid,
    command,
    submissionKey,
    trigger: "user",
  });
  return ok({ taskId, created }, created ? 201 : 200);
});
