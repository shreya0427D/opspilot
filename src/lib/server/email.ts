import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

// Resend refuses to send from addresses on domains you don't control, so catch that up front
// with a clear message instead of a provider error per email.
const FREE_MAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

export type EmailConfig = { ok: true; from: string } | { ok: false; reason: string };

const PLAIN_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

/** Pure check of the sender settings, so it can be unit-tested and shown to the user. */
export function checkEmailConfig(apiKey: string | undefined, from: string | undefined): EmailConfig {
  if (!apiKey) return { ok: false, reason: "Email sending isn't set up: RESEND_API_KEY is missing" };
  if (!apiKey.startsWith("re_")) return { ok: false, reason: "Email sending isn't set up: RESEND_API_KEY doesn't look like a Resend key" };
  if (!from) return { ok: false, reason: "Email sending isn't set up: EMAIL_FROM is missing" };
  const address = from.trim();
  if (!PLAIN_ADDRESS.test(address)) {
    return { ok: false, reason: "EMAIL_FROM must be a plain address like reminders@yourdomain.com (the sender name is added automatically)" };
  }
  const domain = address.split("@")[1].toLowerCase();
  if (FREE_MAIL_DOMAINS.has(domain)) {
    return { ok: false, reason: `EMAIL_FROM uses ${domain}, which can't be verified in Resend. Use an address on a domain you own and have verified in Resend` };
  }
  return { ok: true, from: address };
}

export function emailConfig(): EmailConfig {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  return checkEmailConfig(RESEND_API_KEY, EMAIL_FROM);
}

let resend: Resend | null = null;
const client = () => (resend ??= new Resend(env().RESEND_API_KEY));

export type SendOutcome =
  | { kind: "sent"; providerMessageId: string }
  | { kind: "rejected"; message: string } // permanent: do not retry
  | { kind: "retry"; message: string }; // transient: safe to retry with the same idempotency key

const TRANSIENT = new Set(["rate_limit_exceeded", "internal_server_error", "application_error", "concurrent_idempotent_requests"]);

export async function sendEmail(input: {
  fromName: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}): Promise<SendOutcome> {
  const config = emailConfig();
  if (!config.ok) return { kind: "rejected", message: config.reason };
  const safeName = input.fromName.replace(/[<>"\r\n]/g, "").slice(0, 60);
  try {
    const { data, error } = await client().emails.send(
      {
        from: `${safeName} via OpsPilot <${config.from}>`,
        to: input.to,
        replyTo: input.replyTo,
        subject: input.subject,
        text: input.text,
      },
      { idempotencyKey: input.idempotencyKey },
    );
    if (data) return { kind: "sent", providerMessageId: data.id };
    if (error && TRANSIENT.has(error.name)) return { kind: "retry", message: error.message };
    return { kind: "rejected", message: error?.message ?? "Email provider rejected the message" };
  } catch (err) {
    return { kind: "retry", message: err instanceof Error ? err.message : "Network error" };
  }
}

/** Reads the message back from the provider to confirm what actually happened. */
export async function lookupEmail(id: string): Promise<{ lastEvent: string } | null> {
  try {
    const { data } = await client().emails.get(id);
    return data ? { lastEvent: data.last_event } : null;
  } catch {
    return null;
  }
}
