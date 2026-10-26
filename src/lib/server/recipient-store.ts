import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { emailConfig } from "./email";
import { normalizeEmail, suppressionId, validateRecipient, type RecipientCheck } from "./recipient";
import { ws } from "./workspace-data";

/** Why an address in this workspace must not be emailed again, or null. */
export function suppressionLookup(workspaceId: string) {
  return async (email: string) => {
    const doc = await ws(workspaceId).suppressions.doc(suppressionId(email)).get();
    return doc.exists ? ((doc.get("reason") as string) ?? "was suppressed") : null;
  };
}

/**
 * Checks a client's address for the current email mode. In testing mode the client isn't
 * contacted (mail goes to EMAIL_TEST_RECIPIENT), so only format and suppression are checked;
 * in production the domain's mail routing is checked too.
 */
export function checkClientRecipient(workspaceId: string, email: string | null | undefined): Promise<RecipientCheck> {
  const config = emailConfig();
  return validateRecipient(email, {
    suppressed: suppressionLookup(workspaceId),
    skipDomainCheck: config.ok && config.mode === "testing",
  });
}

export async function recordSuppression(workspaceId: string, email: string, reason: string, event: string) {
  await ws(workspaceId)
    .suppressions.doc(suppressionId(email))
    .set({ email: normalizeEmail(email), reason, event, createdAt: FieldValue.serverTimestamp() }, { merge: true });
}
