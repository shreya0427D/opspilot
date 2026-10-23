import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-opspilot",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "workspaces/wsA"), { name: "A", ownerUid: "alice" });
    await setDoc(doc(db, "workspaces/wsA/members/alice"), { role: "owner" });
    await setDoc(doc(db, "workspaces/wsA/invoices/i1"), { number: "INV-1", totalMinor: 100 });
    await setDoc(doc(db, "workspaces/wsB"), { name: "B", ownerUid: "bob" });
    await setDoc(doc(db, "workspaces/wsB/members/bob"), { role: "owner" });
    await setDoc(doc(db, "users/alice"), { defaultWorkspaceId: "wsA" });
  });
});

const alice = () => env.authenticatedContext("alice", { email_verified: true });
const bob = () => env.authenticatedContext("bob", { email_verified: true });
const unverifiedAlice = () => env.authenticatedContext("alice", { email_verified: false });

describe("Firestore rules", () => {
  it("lets a verified member read their workspace data", async () => {
    await assertSucceeds(getDoc(doc(alice().firestore(), "workspaces/wsA/invoices/i1")));
    await assertSucceeds(getDocs(collection(alice().firestore(), "workspaces/wsA/invoices")));
  });

  it("blocks reading another tenant's workspace", async () => {
    await assertFails(getDoc(doc(bob().firestore(), "workspaces/wsA/invoices/i1")));
    await assertFails(getDocs(collection(bob().firestore(), "workspaces/wsA/invoices")));
  });

  it("blocks unverified and anonymous users", async () => {
    await assertFails(getDoc(doc(unverifiedAlice().firestore(), "workspaces/wsA/invoices/i1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "workspaces/wsA")));
  });

  it("denies all client writes, even to a member's own workspace", async () => {
    await assertFails(setDoc(doc(alice().firestore(), "workspaces/wsA/invoices/i2"), { number: "X" }));
    await assertFails(setDoc(doc(alice().firestore(), "workspaces/wsA/members/mallory"), { role: "owner" }));
    await assertFails(setDoc(doc(alice().firestore(), "users/alice"), { defaultWorkspaceId: "wsB" }));
  });

  it("only lets users read their own user record", async () => {
    await assertSucceeds(getDoc(doc(alice().firestore(), "users/alice")));
    await assertFails(getDoc(doc(bob().firestore(), "users/alice")));
  });
});

describe("Storage rules", () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"

  it("lets a member upload an allowed file type into their workspace", async () => {
    await assertSucceeds(uploadBytes(ref(alice().storage(), "workspaces/wsA/uploads/d1/inv.pdf"), pdf, { contentType: "application/pdf" }));
  });

  it("blocks uploads into another workspace", async () => {
    await assertFails(uploadBytes(ref(bob().storage(), "workspaces/wsA/uploads/d2/inv.pdf"), pdf, { contentType: "application/pdf" }));
  });

  it("blocks disallowed content types and oversize files", async () => {
    await assertFails(uploadBytes(ref(alice().storage(), "workspaces/wsA/uploads/d3/x.html"), pdf, { contentType: "text/html" }));
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(alice().storage(), "workspaces/wsA/uploads/d4/big.pdf"), big, { contentType: "application/pdf" }));
  });

  it("never lets the browser read files directly", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), "workspaces/wsA/uploads/d5/inv.pdf"), pdf, { contentType: "application/pdf" });
    });
    await assertFails(getBytes(ref(alice().storage(), "workspaces/wsA/uploads/d5/inv.pdf")));
  });
});
