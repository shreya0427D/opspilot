import "server-only";
import { createHash } from "node:crypto";
import { promises as dns } from "node:dns";

// Recipient checks run before a reminder is drafted and again right before it is sent. They catch
// addresses that certainly can't receive mail (bad format, reserved or nonexistent domains, domains
// that publish no mail server, addresses that hard-bounced before). Passing them does NOT prove the
// mailbox exists — only delivery events from the provider can confirm that.

export type RecipientProblem = "missing" | "malformed" | "reserved" | "no_domain" | "no_mail" | "dns_error" | "suppressed";
export type RecipientCheck = { ok: true; email: string } | { ok: false; code: RecipientProblem; reason: string };

/** Bare address only (no display name), RFC 5321 length limits, a real-looking TLD. */
const ADDRESS =
  /^(?=.{3,254}$)(?=[^@]{1,64}@)[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** RFC 2606 / 6761 names that can never receive real mail. */
const RESERVED_TLDS = new Set(["test", "example", "invalid", "localhost", "local"]);
const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

const fail = (code: RecipientProblem, reason: string): RecipientCheck => ({ ok: false, code, reason });

export const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** Stable document id for an address (addresses may contain "/" which Firestore ids can't). */
export const suppressionId = (email: string) => createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 40);

export function checkSyntax(raw: string | null | undefined): RecipientCheck {
  const email = normalizeEmail(raw ?? "");
  if (!email) return fail("missing", "No email address is saved for this client");
  if (!ADDRESS.test(email)) return fail("malformed", `"${email}" isn't a valid email address`);
  return { ok: true, email };
}

export interface MailResolver {
  resolveMx(domain: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

const errCode = (err: unknown) => (err as { code?: string })?.code ?? "";

/** True when the domain can receive mail: MX records, or (RFC 5321 implicit MX) an address record. */
export async function checkDomain(domain: string, resolver: MailResolver = dns): Promise<RecipientCheck | null> {
  const tld = domain.split(".").pop() ?? "";
  if (RESERVED_TLDS.has(tld) || RESERVED_DOMAINS.has(domain) || [...RESERVED_DOMAINS].some((d) => domain.endsWith(`.${d}`))) {
    return fail("reserved", `${domain} is a reserved example domain and can't receive email`);
  }
  try {
    const mx = await resolver.resolveMx(domain);
    if (mx.length && mx.every((r) => r.exchange === "" || r.exchange === ".")) {
      return fail("no_mail", `${domain} declares that it accepts no email (null MX record)`);
    }
    if (mx.length) return null;
  } catch (err) {
    const code = errCode(err);
    // ENOTFOUND: the name doesn't exist. ENODATA: it exists but has no MX records (checked below).
    if (code === "ENOTFOUND") return fail("no_domain", `The domain ${domain} doesn't exist`);
    if (code !== "ENODATA") return fail("dns_error", `Couldn't check ${domain}'s mail servers right now (${code || "DNS error"}). Try again later.`);
  }
  // No MX records: fall back to an address record (implicit MX).
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      if ((await lookup.call(resolver, domain)).length) return null;
    } catch {
      // try the next record type
    }
  }
  return fail("no_mail", `${domain} has no mail server (no MX or address records)`);
}

export interface RecipientOptions {
  /** Returns why an address must not be emailed (e.g. a previous hard bounce), or null. */
  suppressed?: (email: string) => Promise<string | null>;
  /** Skip DNS and reserved-domain checks (testing mode: the client isn't actually contacted). */
  skipDomainCheck?: boolean;
  resolver?: MailResolver;
}

export async function validateRecipient(raw: string | null | undefined, opts: RecipientOptions = {}): Promise<RecipientCheck> {
  const syntax = checkSyntax(raw);
  if (!syntax.ok) return syntax;
  const reason = opts.suppressed ? await opts.suppressed(syntax.email) : null;
  if (reason) return fail("suppressed", `${syntax.email} previously ${reason}; it won't be emailed again`);
  if (!opts.skipDomainCheck) {
    const domain = await checkDomain(syntax.email.split("@")[1], opts.resolver);
    if (domain) return domain;
  }
  return syntax;
}

/** Order of provider delivery events: a later event never downgrades a more final one. */
const EVENT_RANK: Record<string, number> = { sent: 1, delivery_delayed: 2, delivered: 3, bounced: 4, complained: 4, failed: 4, suppressed: 4 };

export function nextProviderStatus(current: string | null | undefined, incoming: string): string {
  if (!(incoming in EVENT_RANK)) return current ?? incoming;
  if (!current || !(current in EVENT_RANK)) return incoming;
  return EVENT_RANK[incoming] >= EVENT_RANK[current] ? incoming : current;
}

/**
 * What a Resend delivery event means for us: the status to record and, for permanent failures,
 * why the address must never be emailed again. Transient bounces are recorded but not suppressed.
 */
export function deliveryEventEffect(type: string, bounceType?: string): { status: string; suppress: string | null } | null {
  switch (type) {
    case "email.sent":
      return { status: "sent", suppress: null };
    case "email.delivery_delayed":
      return { status: "delivery_delayed", suppress: null };
    case "email.delivered":
      return { status: "delivered", suppress: null };
    case "email.bounced":
      return { status: "bounced", suppress: (bounceType ?? "").toLowerCase() === "permanent" ? "hard-bounced" : null };
    case "email.complained":
      return { status: "complained", suppress: "marked a reminder as spam" };
    case "email.suppressed":
      return { status: "suppressed", suppress: "is on the email provider's suppression list" };
    case "email.failed":
      return { status: "failed", suppress: null };
    default:
      return null;
  }
}
