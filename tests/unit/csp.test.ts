import { describe, expect, it } from "vitest";
import { buildCsp } from "@/lib/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("content security policy", () => {
  const csp = buildCsp("abc123", { authDomain: "opspilot-28504.firebaseapp.com" });

  it("only runs scripts carrying this request's nonce, without eval", () => {
    expect(directive(csp, "script-src")).toContain("'nonce-abc123'");
    expect(directive(csp, "script-src")).toContain("'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
  });

  it("locks down framing, plugins, base and form targets", () => {
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows exactly the Firebase endpoints the browser uses, no wildcards", () => {
    const connect = directive(csp, "connect-src");
    for (const host of ["identitytoolkit", "securetoken", "firestore", "firebasestorage"]) expect(connect).toContain(`https://${host}.googleapis.com`);
    // The only wildcard allowed is EdgeStore's own subdomains (upload hosts are issued per request).
    expect(connect.replace("https://*.edgestore.dev", "")).not.toMatch(/\s\*|https:\/\/\*/);
    expect(connect).toContain("https://*.edgestore.dev");
    expect(connect).toContain("https://edge-store.s3.us-east-1.amazonaws.com");
    expect(directive(csp, "frame-src")).toContain("https://opspilot-28504.firebaseapp.com");
  });

  it("adds emulator hosts and dev eval only when asked", () => {
    const local = buildCsp("n", { emulators: true, dev: true });
    expect(directive(local, "connect-src")).toContain("http://127.0.0.1:8080");
    expect(directive(local, "script-src")).toContain("'unsafe-eval'");
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(directive(csp, "connect-src")).not.toContain("127.0.0.1");
  });
});
