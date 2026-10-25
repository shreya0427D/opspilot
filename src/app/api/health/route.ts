import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Deployment self-check. Loads each server module in isolation so a module that crashes at import
// time (missing traced file, bad env) is reported by name instead of an empty 500 on every route.
// Reports only whether env vars are present, never their values. Anonymous callers only get the
// overall result; details require `Authorization: Bearer <CRON_SECRET>`.
export const dynamic = "force-dynamic";

const MODULES: Record<string, () => Promise<unknown>> = {
  "firebase-admin": () => import("@/lib/firebase/admin"),
  session: () => import("@/lib/server/session"),
  "route-helpers": () => import("@/lib/server/route"),
  gemini: () => import("@/lib/ai/gemini"),
  "task-engine": () => import("@/lib/tasks/engine"),
  email: () => import("@/lib/server/email"),
  documents: () => import("@/lib/server/services/documents"),
  "internal-auth": () => import("@/lib/server/internal-auth"),
};

const ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_USE_EMULATORS",
  "GEMINI_KEY_PROJECTS",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "EDGESTORE_ACCESS_KEY",
  "EDGESTORE_SECRET_KEY",
  "EMAIL_FROM",
  "EMAIL_TEST_RECIPIENT",
  "TASKS_QUEUE",
];

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  return !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}

export async function GET(req: NextRequest) {
  const modules: Record<string, string> = {};
  for (const [name, load] of Object.entries(MODULES)) {
    try {
      await load();
      modules[name] = "ok";
    } catch (err) {
      const e = err as { code?: string; message?: string };
      modules[name] = `FAILED ${e.code ?? ""} ${String(e.message ?? err).slice(0, 300)}`.trim();
    }
  }

  let envCheck = "ok";
  try {
    const { env } = await import("@/lib/env");
    env();
  } catch (err) {
    envCheck = `FAILED ${String((err as Error).message).slice(0, 300)}`;
  }

  const present = Object.fromEntries(ENV_KEYS.map((k) => [k, Boolean(process.env[k])]));
  const { discoverKeys } = await import("@/lib/ai/keys");
  const geminiKeys = discoverKeys(process.env).map((k) => `${k.name} (project: ${k.project})`);
  let email = "ok";
  if (envCheck === "ok") {
    const { emailConfig } = await import("@/lib/server/email");
    const c = emailConfig();
    email = c.ok ? c.mode : `NOT READY: ${c.reason}`;
  }
  const healthy = Object.values(modules).every((v) => v === "ok") && envCheck === "ok";
  const body = authorized(req)
    ? { healthy, node: process.version, modules, envCheck, email, geminiKeys, envPresent: present, emulators: process.env.NEXT_PUBLIC_USE_EMULATORS === "true" }
    : { healthy };
  return NextResponse.json(body, { status: healthy ? 200 : 500, headers: { "Cache-Control": "no-store" } });
}
