import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { Resend } from "resend";
import { env } from "@/lib/env";
import { adminDb } from "@/lib/firebase/admin";
import { AppError, unauthorized } from "@/lib/server/errors";
import { log } from "@/lib/server/log";
import { deliveryEventEffect, nextProviderStatus } from "@/lib/server/recipient";
import { recordSuppression } from "@/lib/server/recipient-store";
import { handler, ok } from "@/lib/server/route";
import { ws } from "@/lib/server/workspace-data";

// Resend delivery webhooks: the only source that confirms delivery, bounces and complaints.
// Every request is signature-checked; unknown messages are acknowledged and ignored.
export const POST = handler(
  async (req: NextRequest) => {
    const secret = env().RESEND_WEBHOOK_SECRET;
    if (!secret) throw new AppError(503, "webhook_not_configured", "RESEND_WEBHOOK_SECRET isn't set");
    const payload = await req.text();
    let event: { type: string; data?: { email_id?: string; to?: string[]; bounce?: { type?: string } } };
    try {
      // Signature checks need only the signing secret; the API key is irrelevant here.
      event = new Resend(env().RESEND_API_KEY || "re_signature_check_only").webhooks.verify({
        payload,
        headers: {
          id: req.headers.get("svix-id") ?? "",
          timestamp: req.headers.get("svix-timestamp") ?? "",
          signature: req.headers.get("svix-signature") ?? "",
        },
        webhookSecret: secret,
      }) as typeof event;
    } catch {
      throw unauthorized("Invalid webhook signature");
    }

    const effect = deliveryEventEffect(event.type, event.data?.bounce?.type);
    const messageId = event.data?.email_id;
    if (!effect || !messageId) return ok({ ignored: true });

    const db = adminDb();
    const link = await db.doc(`emailMessages/${messageId}`).get();
    if (!link.exists) return ok({ ignored: true });
    const { workspaceId, approvalId, itemId } = link.data() as { workspaceId: string; approvalId: string; itemId: string };

    const itemRef = ws(workspaceId).approvals.doc(approvalId).collection("items").doc(itemId);
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(itemRef)).get("providerStatus") as string | undefined;
      const next = nextProviderStatus(current, effect.status);
      if (next !== current) tx.update(itemRef, { providerStatus: next, providerUpdatedAt: FieldValue.serverTimestamp() });
    });
    // Permanent failures: never email these actual recipients again.
    if (effect.suppress) {
      await Promise.all((event.data?.to ?? []).map((to) => recordSuppression(workspaceId, to, effect.suppress!, event.type)));
    }
    log.info("Delivery event recorded", { workspaceId, messageId, type: event.type });
    return ok({ recorded: effect.status });
  },
  { sameOrigin: false },
);
