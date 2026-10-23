import "server-only";
import { timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { unauthorized } from "./errors";

const oauth = new OAuth2Client();

/**
 * Internal endpoints accept either a Google-signed OIDC token from our invoker service account
 * (Cloud Tasks / Cloud Scheduler in production) or the shared CRON_SECRET (local development).
 */
export async function assertInternalCaller(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw unauthorized("Missing credentials");
  const { CRON_SECRET, TASKS_INVOKER_SA, NEXT_PUBLIC_APP_URL } = env();

  if (CRON_SECRET && token.length === CRON_SECRET.length && timingSafeEqual(Buffer.from(token), Buffer.from(CRON_SECRET))) {
    return;
  }
  if (TASKS_INVOKER_SA) {
    try {
      const ticket = await oauth.verifyIdToken({ idToken: token, audience: NEXT_PUBLIC_APP_URL });
      const payload = ticket.getPayload();
      if (payload?.email === TASKS_INVOKER_SA && payload.email_verified) return;
    } catch {
      // fall through
    }
  }
  throw unauthorized("Invalid credentials");
}
