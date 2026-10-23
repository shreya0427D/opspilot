import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";
import { clearSampleData, loadSampleData } from "@/lib/server/services/sample";

export const POST = handler(async () => ok(await loadSampleData(await requireWorkspace())));

export const DELETE = handler(async () => {
  await clearSampleData(await requireWorkspace());
  return ok();
});
