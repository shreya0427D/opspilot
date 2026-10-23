import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_USE_EMULATORS: z.enum(["true", "false"]).default("false"),

  GEMINI_API_KEY: z.string().min(20),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Internal endpoints (Cloud Tasks / Scheduler). OIDC in production; shared secret as local fallback.
  CRON_SECRET: z.string().min(32).optional().or(z.literal("").transform(() => undefined)),
  TASKS_QUEUE: z.string().optional(), // projects/{p}/locations/{l}/queues/{q}; unset => in-process dispatch
  TASKS_INVOKER_SA: z.string().optional(), // service account email used for OIDC tokens

  DAILY_TASK_LIMIT: z.coerce.number().int().positive().default(50),
  DAILY_MODEL_BUDGET_MICROS: z.coerce.number().int().positive().default(500_000), // $0.50
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const raw = {
    ...process.env,
    // Local .env still carries numbered keys from the interview; production uses GEMINI_API_KEY.
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? process.env.GEMINI_API_KEY_1,
  };
  const parsed = serverEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

export const useEmulators = () => process.env.NEXT_PUBLIC_USE_EMULATORS === "true";
