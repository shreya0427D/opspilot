import { clientInput } from "@/lib/domain/inputs";
import { handler, ok, readJson } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { createClient } from "@/lib/server/services/records";

export const POST = handler(async (req) => {
  const ctx = await requireWorkspace();
  const id = await createClient(ctx, await readJson(req, clientInput));
  return ok({ id }, 201);
});
