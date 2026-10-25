import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture exactly what would be handed to Resend; nothing is ever sent.
const sent: { payload: Record<string, unknown>; options: unknown }[] = [];
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>, options: unknown) => {
        sent.push({ payload, options });
        return { data: { id: "msg_test" }, error: null };
      },
      get: async () => ({ data: null }),
    };
  },
}));

const envValues: Record<string, string | undefined> = {};
vi.mock("@/lib/env", () => ({ env: () => envValues }));

const { sendEmail, checkEmailConfig } = await import("@/lib/server/email");

const OWNER = "shreya0427singh@gmail.com";
const CLIENT = "accounts@cedarpine.example.com";
const KEY = "re_test_0000000000000000";
const message = {
  fromName: "Aman",
  to: CLIENT,
  replyTo: "aman@studio.example",
  subject: "Payment overdue: invoice OPA-2026-1041",
  text: "Hi Cedar & Pine Creative Studio,",
  idempotencyKey: "reminder/item-1",
};

function setEnv(from: string | undefined, testRecipient?: string) {
  for (const k of Object.keys(envValues)) delete envValues[k];
  Object.assign(envValues, { RESEND_API_KEY: KEY, EMAIL_FROM: from, EMAIL_TEST_RECIPIENT: testRecipient });
}

const recipients = (p: Record<string, unknown>) => [p.to, p.cc, p.bcc].flat().filter(Boolean) as string[];

describe("final email payload", () => {
  beforeEach(() => {
    sent.length = 0;
  });

  it.each(["onboarding@resend.dev", "opspilot@resend.dev", " Onboarding@Resend.dev ", '"onboarding@resend.dev"'])(
    "testing mode (%s) sends only to the test recipient",
    async (from) => {
      setEnv(from, `  ${OWNER} `);
      const outcome = await sendEmail(message);
      expect(outcome).toMatchObject({ kind: "sent", deliveredTo: OWNER, testMode: true });
      expect(sent).toHaveLength(1);
      expect(recipients(sent[0].payload)).toEqual([OWNER]);
    },
  );

  it("never puts the client's address in to, cc or bcc in testing mode, and labels the test", async () => {
    setEnv("onboarding@resend.dev", OWNER);
    await sendEmail(message);
    const { payload, options } = sent[0];
    expect(recipients(payload)).not.toContain(CLIENT);
    expect(payload.subject).toBe(`[TEST — would go to ${CLIENT}] ${message.subject}`);
    expect(payload.text).toContain(`would be sent to ${CLIENT}`);
    expect(options).toEqual({ idempotencyKey: message.idempotencyKey });
  });

  it("refuses to send when the test recipient is missing or invalid", async () => {
    for (const bad of [undefined, "", "not-an-email", `Shreya <${OWNER}>`]) {
      setEnv("onboarding@resend.dev", bad);
      const outcome = await sendEmail(message);
      expect(outcome).toMatchObject({ kind: "rejected", message: expect.stringMatching(/EMAIL_TEST_RECIPIENT/) });
    }
    expect(sent).toHaveLength(0);
  });

  it("production mode sends to the client only from the configured own-domain sender", async () => {
    setEnv("reminders@opspilot.example", OWNER);
    await sendEmail(message);
    expect(recipients(sent[0].payload)).toEqual([CLIENT]);
    expect(sent[0].payload.from).toBe("Aman via OpsPilot <reminders@opspilot.example>");
    expect(sent[0].payload.subject).toBe(message.subject);
  });

  it("production mode never uses a shared or free-mail sender", () => {
    expect(checkEmailConfig(KEY, "anything@resend.dev", OWNER)).toMatchObject({ mode: "testing" });
    expect(checkEmailConfig(KEY, "me@gmail.com", OWNER)).toMatchObject({ ok: false, mode: "blocked" });
  });
});
