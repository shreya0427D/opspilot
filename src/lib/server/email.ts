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

/** Resend's shared testing sender: works without a verified domain, but only delivers to the
 * email address of the Resend account itself. */
export const RESEND_TEST_SENDER = "onboarding@resend.dev";

export type EmailConfig =
  | { ok: true; mode: "production"; from: string }
  /** Testing: every approved email is delivered to `testRecipient` (the owner), never to clients. */
  | { ok: true; mode: "testing"; from: string; testRecipient: string }
  | { ok: false; mode: "blocked"; reason: string };

const PLAIN_ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i;

const blocked = (reason: string): EmailConfig => ({ ok: false, mode: "blocked", reason });

const RESEND_TEST_DOMAIN = "resend.dev";

/** An env value as pasted into a dashboard: trims whitespace and stray surrounding quotes. */
const bare = (value: string | undefined) => (value ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

/** Pure check of the sender settings, so it can be unit-tested and shown to the user. */
export function checkEmailConfig(apiKey: string | undefined, from: string | undefined, testRecipient?: string): EmailConfig {
  if (!apiKey) return blocked("Email sending isn't set up: RESEND_API_KEY is missing.");
  if (!apiKey.startsWith("re_")) return blocked("Email sending isn't set up: RESEND_API_KEY doesn't look like a Resend key.");
  const address = bare(from);
  if (!address) return blocked("Email sending isn't set up: EMAIL_FROM is missing.");
  if (!PLAIN_ADDRESS.test(address)) {
    return blocked("EMAIL_FROM must be a plain address like reminders@yourdomain.com (the sender name is added automatically).");
  }
  // Every sender on Resend's shared domain is testing-only (Resend refuses other recipients),
  // whatever its local part — so any resend.dev sender means testing mode, not just onboarding@.
  if (address.split("@")[1].toLowerCase() === RESEND_TEST_DOMAIN) {
    const to = bare(testRecipient);
    if (!to || !PLAIN_ADDRESS.test(to)) {
      return blocked("Testing mode needs EMAIL_TEST_RECIPIENT set to the email address of your Resend account.");
    }
    return { ok: true, mode: "testing", from: address, testRecipient: to };
  }
  const domain = address.split("@")[1].toLowerCase();
  if (FREE_MAIL_DOMAINS.has(domain)) {
    return blocked(
      `EMAIL_FROM uses ${domain}, which Resend can't send from. To test now, set EMAIL_FROM=${RESEND_TEST_SENDER} and EMAIL_TEST_RECIPIENT to your Resend account's email. To email clients, verify a domain you own in Resend and use an address on it.`,
    );
  }
  return { ok: true, mode: "production", from: address };
}

export function emailConfig(): EmailConfig {
  const { RESEND_API_KEY, EMAIL_FROM, EMAIL_TEST_RECIPIENT } = env();
  return checkEmailConfig(RESEND_API_KEY, EMAIL_FROM, EMAIL_TEST_RECIPIENT);
}

let resend: Resend | null = null;
const client = () => (resend ??= new Resend(env().RESEND_API_KEY));

export type SendOutcome =
  | { kind: "sent"; providerMessageId: string; deliveredTo: string; testMode: boolean }
  | { kind: "rejected"; message: string } // permanent: do not retry
  | { kind: "retry"; message: string }; // transient: safe to retry with the same idempotency key

const TRANSIENT = new Set(["rate_limit_exceeded", "internal_server_error", "application_error", "concurrent_idempotent_requests"]);

export interface OutgoingEmail {
  fromName: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

/**
 * The exact message handed to Resend. In testing mode the only recipient is the configured test
 * address; the client's address appears solely in the labelled subject and body, never in to/cc/bcc.
 */
export function buildPayload(config: Extract<EmailConfig, { ok: true }>, input: OutgoingEmail) {
  const safeName = input.fromName.replace(/[<>"\r\n]/g, "").slice(0, 60);
  const testMode = config.mode === "testing";
  return {
    from: `${safeName} via OpsPilot <${config.from}>`,
    to: [testMode ? config.testRecipient : input.to],
    replyTo: input.replyTo,
    subject: testMode ? `[TEST — would go to ${input.to}] ${input.subject}` : input.subject,
    text: testMode ? `This is an OpsPilot test email. In production it would be sent to ${input.to}.\n\n---\n\n${input.text}` : input.text,
  };
}

export async function sendEmail(input: OutgoingEmail): Promise<SendOutcome> {
  const config = emailConfig();
  if (!config.ok) return { kind: "rejected", message: config.reason };
  // Testing mode never contacts clients: the owner receives the email, clearly labelled.
  const testMode = config.mode === "testing";
  const payload = buildPayload(config, input);
  const to = payload.to[0];
  try {
    const { data, error } = await client().emails.send(payload, { idempotencyKey: input.idempotencyKey });
    if (data) return { kind: "sent", providerMessageId: data.id, deliveredTo: to, testMode };
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
