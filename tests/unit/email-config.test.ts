import { describe, expect, it } from "vitest";
import { checkEmailConfig } from "@/lib/server/email";

const KEY = "re_test_0000000000000000";

describe("sender configuration", () => {
  it("accepts a plain address on a custom domain", () => {
    expect(checkEmailConfig(KEY, "reminders@opspilot.example")).toEqual({ ok: true, from: "reminders@opspilot.example" });
  });

  it("explains a free-mail sender that Resend can't verify", () => {
    const r = checkEmailConfig(KEY, "someone@gmail.com");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/gmail\.com.*verified in Resend/);
  });

  it("rejects missing or malformed settings with an actionable reason", () => {
    expect(checkEmailConfig(undefined, "a@b.example")).toMatchObject({ ok: false, reason: expect.stringMatching(/RESEND_API_KEY is missing/) });
    expect(checkEmailConfig("sk_wrong", "a@b.example")).toMatchObject({ ok: false, reason: expect.stringMatching(/doesn't look like a Resend key/) });
    expect(checkEmailConfig(KEY, undefined)).toMatchObject({ ok: false, reason: expect.stringMatching(/EMAIL_FROM is missing/) });
    expect(checkEmailConfig(KEY, "Sam <sam@opspilot.example>")).toMatchObject({ ok: false, reason: expect.stringMatching(/plain address/) });
  });
});
