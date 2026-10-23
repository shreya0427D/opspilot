import type { NextRequest } from "next/server";
import { notFound } from "@/lib/server/errors";
import { assertInternalCaller } from "@/lib/server/internal-auth";
import { handler, ok } from "@/lib/server/route";
import { runDailyChecks } from "@/lib/server/services/daily-check";
import { recoverStaleSteps } from "@/lib/tasks/engine";

export const maxDuration = 60;

// Targets: /api/internal/cron/daily and /api/internal/cron/recover.
// Cloud Scheduler sends POST (hourly / every 10 min). Vercel Cron sends GET, and on plans limited
// to one run per day the daily check is called with ?anyHour=1 so it doesn't wait for a match.
async function run(req: NextRequest, { params }: RouteContext<"/api/internal/cron/[job]">) {
  await assertInternalCaller(req);
  const { job } = await params;
  if (job === "daily") return ok(await runDailyChecks(new Date(), { anyHour: req.nextUrl.searchParams.get("anyHour") === "1" }));
  if (job === "recover") return ok({ recovered: await recoverStaleSteps() });
  throw notFound();
}

export const POST = handler(run, { sameOrigin: false });
export const GET = handler(run, { sameOrigin: false });
