import { cookies } from "next/headers";
import { handler, ok } from "@/lib/server/route";
import { SESSION_COOKIE, requireRecentLogin, requireUser, requireWorkspace } from "@/lib/server/session";
import { deleteAccount } from "@/lib/server/services/workspace";

export const DELETE = handler(async () => {
  const user = await requireUser();
  requireRecentLogin(user);
  const ctx = await requireWorkspace().catch(() => user); // users who never finished onboarding
  await deleteAccount(ctx);
  (await cookies()).delete(SESSION_COOKIE);
  return ok();
});
