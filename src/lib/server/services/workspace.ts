import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import type { z } from "zod";
import type { createWorkspaceInput, templateInput, updateWorkspaceInput } from "@/lib/domain/inputs";
import { DEFAULT_TEMPLATES } from "@/lib/domain/reminders";
import { REMINDER_STAGES } from "@/lib/domain/types";
import { adminAuth, adminBucket, adminDb } from "@/lib/firebase/admin";
import { conflict } from "../errors";
import { log } from "../log";
import type { SessionUser, WorkspaceContext } from "../session";
import { audit, ws } from "../workspace-data";

export async function createWorkspace(user: SessionUser, input: z.infer<typeof createWorkspaceInput>) {
  const db = adminDb();
  const userRef = db.doc(`users/${user.uid}`);
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(userRef);
    if (existing.get("defaultWorkspaceId")) throw conflict("You already have a workspace");
    const wsRef = db.collection("workspaces").doc();
    const col = ws(wsRef.id, db);
    tx.set(wsRef, {
      ...input,
      ownerUid: user.uid,
      dailyCheck: { enabled: true, hourLocal: 9 },
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(col.members.doc(user.uid), { role: "owner", email: user.email, joinedAt: FieldValue.serverTimestamp() });
    for (const stage of REMINDER_STAGES) {
      tx.set(col.templates.doc(stage), { stage, ...DEFAULT_TEMPLATES[stage], updatedAt: FieldValue.serverTimestamp() });
    }
    tx.set(userRef, { email: user.email, defaultWorkspaceId: wsRef.id, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    await audit(wsRef.id, user.uid, "workspace.created", `workspaces/${wsRef.id}`, {}, tx);
    return wsRef.id;
  });
}

export async function updateWorkspace(ctx: WorkspaceContext, input: z.infer<typeof updateWorkspaceInput>) {
  await ws(ctx.workspaceId).root.update({ ...input });
  await audit(ctx.workspaceId, ctx.uid, "workspace.updated", `workspaces/${ctx.workspaceId}`, {
    fields: Object.keys(input).join(","),
  });
}

export async function saveTemplate(ctx: WorkspaceContext, input: z.infer<typeof templateInput>) {
  await ws(ctx.workspaceId).templates.doc(input.stage).set({ ...input, updatedAt: FieldValue.serverTimestamp() });
  await audit(ctx.workspaceId, ctx.uid, "template.updated", `templates/${input.stage}`);
}

/**
 * Permanently deletes the user's workspace (all subcollections), uploaded files, user record
 * and Auth account. Caller must have verified a recent sign-in.
 */
export async function deleteAccount(ctx: WorkspaceContext | SessionUser) {
  const db = adminDb();
  const workspaceId = "workspaceId" in ctx ? ctx.workspaceId : null;
  if (workspaceId) {
    await adminBucket().deleteFiles({ prefix: `workspaces/${workspaceId}/` });
    await db.recursiveDelete(db.doc(`workspaces/${workspaceId}`));
  }
  await db.doc(`users/${ctx.uid}`).delete();
  await adminAuth().deleteUser(ctx.uid);
  log.info("Account deleted", { uid: ctx.uid, workspaceId });
}
