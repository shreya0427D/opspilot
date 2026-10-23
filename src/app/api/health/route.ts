import { NextResponse } from "next/server";

// Deployment self-check. Loads each server module in isolation so a module that crashes at import
// time (missing traced file, bad env) is reported by name instead of an empty 500 on every route.
// Reports only whether env vars are present, never their values.
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
  "GEMINI_API_KEY",
  "GEMINI_API_KEY_1",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "CRON_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "TASKS_QUEUE",
];

export async function GET() {
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
  const healthy = Object.values(modules).every((v) => v === "ok") && envCheck === "ok";
  return NextResponse.json(
    { healthy, node: process.version, modules, envCheck, envPresent: present, emulators: process.env.NEXT_PUBLIC_USE_EMULATORS === "true" },
    { status: healthy ? 200 : 500, headers: { "Cache-Control": "no-store" } },
  );
}
