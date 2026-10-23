import "server-only";
import { todayInZone } from "@/lib/domain/dates";
import type { Workspace } from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { createTask } from "@/lib/tasks/engine";
import { log } from "../log";

function hourInZone(timeZone: string, now: Date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now));
}

/**
 * Runs hourly (Cloud Scheduler). For each workspace whose local hour matches its setting,
 * starts a draft-only collections task. The submission key is per workspace per day, so a
 * repeated or overlapping cron run cannot create a second task.
 */
export async function runDailyChecks(now = new Date(), opts: { anyHour?: boolean } = {}) {
  const snap = await adminDb().collection("workspaces").where("dailyCheck.enabled", "==", true).get();
  let started = 0;
  for (const doc of snap.docs) {
    const w = doc.data() as Workspace;
    if (!opts.anyHour && hourInZone(w.timezone, now) !== w.dailyCheck.hourLocal) continue;
    try {
      const { created } = await createTask({
        workspaceId: doc.id,
        actorUid: "system",
        command: "Daily overdue check",
        submissionKey: `daily:${todayInZone(w.timezone, now)}`,
        trigger: "daily_check",
        intent: "collections",
        params: { dailyCheck: true },
      });
      if (created) started++;
    } catch (err) {
      log.warn("Daily check skipped", { workspaceId: doc.id, err });
    }
  }
  return { started };
}
