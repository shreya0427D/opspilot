import { emailConfig } from "@/lib/server/email";
import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";

/** Tells the signed-in user whether approved emails can actually be sent, and if not, why. */
export const GET = handler(async () => {
  await requireWorkspace();
  const config = emailConfig();
  if (!config.ok) return ok({ ok: false, mode: "blocked", reason: config.reason });
  if (config.mode === "testing") return ok({ ok: true, mode: "testing", testRecipient: config.testRecipient });
  return ok({ ok: true, mode: "production" });
});
