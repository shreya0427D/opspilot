import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { todayInZone } from "@/lib/domain/dates";
import { env } from "@/lib/env";
import { limitReached } from "./errors";

export const ws = (workspaceId: string, db: Firestore = adminDb()) => {
  const root = db.doc(`workspaces/${workspaceId}`);
  return {
    root,
    members: root.collection("members"),
    clients: root.collection("clients"),
    invoices: root.collection("invoices"),
    payments: root.collection("payments"),
    documents: root.collection("documents"),
    templates: root.collection("templates"),
    tasks: root.collection("tasks"),
    approvals: root.collection("approvals"),
    usageDaily: root.collection("usageDaily"),
    auditEvents: root.collection("auditEvents"),
  };
};

type AuditMetadata = Record<string, string | number | boolean | null>;

/** Append-only audit trail. Metadata must not contain message bodies or document content. */
export async function audit(
  workspaceId: string,
  actorUid: string,
  action: string,
  target: string,
  metadata: AuditMetadata = {},
  tx?: Transaction,
) {
  const ref = ws(workspaceId).auditEvents.doc();
  const data = { actorUid, action, target, metadata, ts: FieldValue.serverTimestamp() };
  if (tx) tx.set(ref, data);
  else await ref.set(data);
}

async function usageRef(workspaceId: string) {
  const wsDoc = await ws(workspaceId).root.get();
  const tz = (wsDoc.get("timezone") as string) ?? "UTC";
  return ws(workspaceId).usageDaily.doc(todayInZone(tz));
}

export async function recordUsage(
  workspaceId: string,
  delta: Partial<Record<"tasks" | "modelCalls" | "tokensIn" | "tokensOut" | "costMicros" | "emailsSent", number>>,
) {
  const ref = await usageRef(workspaceId);
  const update: Record<string, FieldValue> = {};
  for (const [k, v] of Object.entries(delta)) if (v) update[k] = FieldValue.increment(v);
  if (Object.keys(update).length) await ref.set(update, { merge: true });
}

/** Enforced in code before starting tasks and before every model call. */
export async function assertWithinLimits(workspaceId: string, kind: "task" | "model") {
  const snap = await (await usageRef(workspaceId)).get();
  const { DAILY_TASK_LIMIT, DAILY_MODEL_BUDGET_MICROS } = env();
  if (kind === "task" && (snap.get("tasks") ?? 0) >= DAILY_TASK_LIMIT) {
    throw limitReached(`Daily task limit (${DAILY_TASK_LIMIT}) reached. It resets at midnight.`);
  }
  if ((snap.get("costMicros") ?? 0) >= DAILY_MODEL_BUDGET_MICROS) {
    throw limitReached("Daily AI budget reached. It resets at midnight.");
  }
}
