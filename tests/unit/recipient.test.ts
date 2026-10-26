import { describe, expect, it } from "vitest";
import {
  checkSyntax,
  deliveryEventEffect,
  nextProviderStatus,
  validateRecipient,
  type MailResolver,
} from "@/lib/server/recipient";

const dnsError = (code: string) => Object.assign(new Error(code), { code });

/** Offline DNS: a table of domain → MX / A records; unknown names don't exist. */
function resolver(table: Record<string, { mx?: string[]; a?: string[]; fail?: string }>): MailResolver {
  const entry = (d: string) => {
    const e = table[d];
    if (!e) throw dnsError("ENOTFOUND");
    if (e.fail) throw dnsError(e.fail);
    return e;
  };
  return {
    resolveMx: async (d) => {
      const mx = entry(d).mx;
      if (!mx) throw dnsError("ENODATA");
      return mx.map((exchange, priority) => ({ exchange, priority }));
    },
    resolve4: async (d) => {
      const a = entry(d).a;
      if (!a) throw dnsError("ENODATA");
      return a;
    },
    resolve6: async () => {
      throw dnsError("ENODATA");
    },
  };
}

const DNS = resolver({
  "gmail.com": { mx: ["gmail-smtp-in.l.google.com"] },
  "nullmx.example-corp.com": { mx: ["."] },
  "aonly.example-corp.com": { a: ["203.0.113.7"] },
  "nomail.example-corp.com": {},
  "slow.example-corp.com": { fail: "ETIMEOUT" },
});

describe("recipient validation", () => {
  it("accepts a valid address whose domain routes mail", async () => {
    expect(await validateRecipient("kumaraman19137@gmail.com", { resolver: DNS })).toEqual({ ok: true, email: "kumaraman19137@gmail.com" });
    expect(await validateRecipient("  Kumaraman19137@Gmail.com ", { resolver: DNS })).toEqual({ ok: true, email: "kumaraman19137@gmail.com" });
  });

  it("rejects missing addresses", async () => {
    for (const v of [undefined, null, "", "   "]) {
      expect(await validateRecipient(v, { resolver: DNS })).toMatchObject({ ok: false, code: "missing" });
    }
  });

  it("rejects malformed addresses without touching DNS", () => {
    for (const v of ["kumar", "kumar@@gmail.com", "a b@gmail.com", "Kumar <kumar@gmail.com>", "kumar@gmail", ".kumar@gmail.com", "ku..mar@gmail.com", "kumar@gmail.c", "a@b@gmail.com"]) {
      expect(checkSyntax(v)).toMatchObject({ ok: false, code: "malformed" });
    }
  });

  it("rejects reserved example domains and domains that can't receive mail", async () => {
    expect(await validateRecipient("accounts@cedarpine.example.com", { resolver: DNS })).toMatchObject({ ok: false, code: "reserved" });
    expect(await validateRecipient("billing@client.test", { resolver: DNS })).toMatchObject({ ok: false, code: "reserved" });
    expect(await validateRecipient("ap@does-not-exist-9f2c.com", { resolver: DNS })).toMatchObject({ ok: false, code: "no_domain" });
    expect(await validateRecipient("ap@nullmx.example-corp.com", { resolver: DNS })).toMatchObject({ ok: false, code: "no_mail" });
    expect(await validateRecipient("ap@nomail.example-corp.com", { resolver: DNS })).toMatchObject({ ok: false, code: "no_mail" });
  });

  it("accepts implicit-MX domains and never sends when DNS can't be checked", async () => {
    expect(await validateRecipient("ap@aonly.example-corp.com", { resolver: DNS })).toMatchObject({ ok: true });
    expect(await validateRecipient("ap@slow.example-corp.com", { resolver: DNS })).toMatchObject({ ok: false, code: "dns_error" });
  });

  it("refuses addresses that previously hard-bounced (e.g. Resend's bounced@resend.dev test address)", async () => {
    const suppressed = async (email: string) => (email === "bounced@resend.dev" ? "hard-bounced" : null);
    const r = await validateRecipient("Bounced@Resend.dev", { suppressed, resolver: resolver({ "resend.dev": { mx: ["feedback-smtp.resend.dev"] } }) });
    expect(r).toMatchObject({ ok: false, code: "suppressed", reason: expect.stringMatching(/hard-bounced/) });
  });

  it("in testing mode checks format and suppression but not the (uncontacted) client's domain", async () => {
    expect(await validateRecipient("accounts@cedarpine.example.com", { skipDomainCheck: true, resolver: DNS })).toMatchObject({ ok: true });
    expect(await validateRecipient("not-an-email", { skipDomainCheck: true })).toMatchObject({ ok: false, code: "malformed" });
  });
});

describe("delivery events", () => {
  it("maps provider events and suppresses only permanent failures", () => {
    expect(deliveryEventEffect("email.delivered")).toEqual({ status: "delivered", suppress: null });
    expect(deliveryEventEffect("email.bounced", "Permanent")).toEqual({ status: "bounced", suppress: "hard-bounced" });
    expect(deliveryEventEffect("email.bounced", "Transient")).toEqual({ status: "bounced", suppress: null });
    expect(deliveryEventEffect("email.complained")?.suppress).toMatch(/spam/);
    expect(deliveryEventEffect("email.opened")).toBeNull();
  });

  it("never downgrades a final status when events arrive out of order", () => {
    expect(nextProviderStatus(null, "sent")).toBe("sent");
    expect(nextProviderStatus("sent", "delivered")).toBe("delivered");
    expect(nextProviderStatus("delivered", "sent")).toBe("delivered");
    expect(nextProviderStatus("delivered", "bounced")).toBe("bounced");
    expect(nextProviderStatus("bounced", "delivery_delayed")).toBe("bounced");
  });
});
