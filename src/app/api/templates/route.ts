import { templateInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { saveTemplate } from "@/lib/server/services/workspace";

export const PUT = handler(async (req) => {
  const ctx = await requireWorkspace();
  await saveTemplate(ctx, await readJson(req, templateInput));
  return ok();
});
