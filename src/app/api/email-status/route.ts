import { emailConfig } from "@/lib/server/email";
import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";

/** Tells the signed-in user whether approved emails can actually be sent, and if not, why. */
export const GET = handler(async () => {
  await requireWorkspace();
  const config = emailConfig();
  return ok(config.ok ? { ok: true } : { ok: false, reason: config.reason });
});
