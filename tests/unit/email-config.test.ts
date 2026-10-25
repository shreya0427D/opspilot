import { describe, expect, it } from "vitest";
import { checkEmailConfig } from "@/lib/server/email";

const KEY = "re_test_0000000000000000";

describe("sender configuration", () => {
  it("accepts a plain address on a custom domain", () => {
    expect(checkEmailConfig(KEY, "reminders@opspilot.example")).toEqual({ ok: true, mode: "production", from: "reminders@opspilot.example" });
  });

  it("explains a free-mail sender that Resend can't verify", () => {
    const r = checkEmailConfig(KEY, "someone@gmail.com");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/gmail\.com.*onboarding@resend\.dev/);
  });

  it("rejects missing or malformed settings with an actionable reason", () => {
    expect(checkEmailConfig(undefined, "a@b.example")).toMatchObject({ ok: false, reason: expect.stringMatching(/RESEND_API_KEY is missing/) });
    expect(checkEmailConfig("sk_wrong", "a@b.example")).toMatchObject({ ok: false, reason: expect.stringMatching(/doesn't look like a Resend key/) });
    expect(checkEmailConfig(KEY, undefined)).toMatchObject({ ok: false, reason: expect.stringMatching(/EMAIL_FROM is missing/) });
    expect(checkEmailConfig(KEY, "Sam <sam@opspilot.example>")).toMatchObject({ ok: false, reason: expect.stringMatching(/plain address/) });
  });

  it("supports Resend testing mode, delivering only to the configured owner address", () => {
    expect(checkEmailConfig(KEY, "onboarding@resend.dev", "owner@example.com")).toEqual({
      ok: true,
      mode: "testing",
      from: "onboarding@resend.dev",
      testRecipient: "owner@example.com",
    });
    expect(checkEmailConfig(KEY, "onboarding@resend.dev", undefined)).toMatchObject({ ok: false, mode: "blocked", reason: expect.stringMatching(/EMAIL_TEST_RECIPIENT/) });
  });
});
