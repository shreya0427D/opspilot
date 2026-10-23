import { notFound } from "@/lib/server/errors";
import { assertInternalCaller } from "@/lib/server/internal-auth";
import { handler, ok } from "@/lib/server/route";
import { runDailyChecks } from "@/lib/server/services/daily-check";
import { recoverStaleSteps } from "@/lib/tasks/engine";

// Cloud Scheduler targets: /api/internal/cron/daily (hourly) and /api/internal/cron/recover (every 10 min).
export const POST = handler<RouteContext<"/api/internal/cron/[job]">>(
  async (req, { params }) => {
    await assertInternalCaller(req);
    const { job } = await params;
    if (job === "daily") return ok(await runDailyChecks());
    if (job === "recover") return ok({ recovered: await recoverStaleSteps() });
    throw notFound();
  },
  { sameOrigin: false },
);
