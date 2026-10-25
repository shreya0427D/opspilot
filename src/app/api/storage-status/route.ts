import { getEdgeStoreRouter } from "@/lib/edgestore/router";
import { handler, ok } from "@/lib/server/route";
import { requireWorkspace } from "@/lib/server/session";

const NAMES = ["EDGESTORE_ACCESS_KEY", "EDGESTORE_SECRET_KEY", "EDGE_STORE_ACCESS_KEY", "EDGE_STORE_SECRET_KEY"] as const;

/**
 * Tells a signed-in user whether file storage can start on this deployment. Reports only whether
 * each variable has a value, never the value itself, plus the deployed commit to rule out a
 * stale deployment.
 */
export const GET = handler(async () => {
  await requireWorkspace();
  const present = Object.fromEntries(NAMES.map((n) => [n, !!process.env[n]?.trim()]));
  let initialized = false;
  let initError: string | undefined;
  try {
    initialized = getEdgeStoreRouter() !== null;
  } catch (err) {
    initError = err instanceof Error ? err.message.slice(0, 200) : "Unknown error";
  }
  return ok({
    present,
    initialized,
    initError,
    deployment: {
      env: process.env.VERCEL_ENV ?? "local",
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
  });
});
