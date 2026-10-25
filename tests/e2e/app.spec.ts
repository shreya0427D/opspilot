import { expect, test, type Page } from "@playwright/test";
import { REGISTER, invoicePdf, invoicePng, watchPage } from "./helpers";

// Full browser journey on the local production build + Firebase emulators, with the real Gemini
// model reading synthetic invoices. Stops at the approval screen: nothing is ever sent.
// The local Firestore emulator sometimes drops a browser's first listen request; the client retries
// after ~10-30s (production answered in <2.5s in testing), so data-dependent waits allow 60s here.
const DATA = { timeout: 60_000 };

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

async function markEmailVerified(email: string) {
  const { getApps, initializeApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-opspilot" });
  const user = await getAuth(app).getUserByEmail(email);
  await getAuth(app).updateUser(user.uid, { emailVerified: true });
}

async function signUpAndOnboard(page: Page, email: string, business: string) {
  await page.goto("/signup");
  await page.getByLabel("Your name").fill("QA Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/verify-email/);
  await markEmailVerified(email);
  await page.getByRole("button", { name: "I've verified my email" }).click();
  await expect(page).toHaveURL(/\/onboarding/, DATA);
  await page.getByLabel("Business name").fill(business);
  await page.getByLabel("Sign reminders as").fill("QA");
  // Chromium lists India as the legacy canonical "Asia/Calcutta"; accept either name.
  const zone = await page.getByLabel("Timezone").evaluate((el) =>
    Array.from((el as HTMLSelectElement).options).find((o) => /Asia\/(Kolkata|Calcutta)/.test(o.value))!.value,
  );
  await page.getByLabel("Timezone").selectOption(zone);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/app$/, DATA);
}

const rowFor = (page: Page, number: string) => page.getByRole("row").filter({ hasText: number });

test("public pages render with no CSP violations @mobile", async ({ page }) => {
  const watch = await watchPage(page);
  for (const path of ["/", "/login", "/signup", "/privacy", "/terms"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    expect(res?.headers()["content-security-policy"], path).toContain("'strict-dynamic'");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);
  }
  expect(await watch.collect()).toEqual([]);
});

test("protected pages redirect when signed out", async ({ page }) => {
  await page.goto("/app/invoices");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Finvoices/);
});

test("full journey: upload the register, check statuses, draft reminders, stop before sending", async ({ page, browser }) => {
  const watch = await watchPage(page);
  const email = `qa+${Date.now()}@opspilot-test.example`;

  await test.step("sign up, verify email, onboard", async () => {
    await signUpAndOnboard(page, email, "QA Studio");
    await expect(page.getByText("Get started")).toBeVisible(DATA); // real empty state, not a skeleton
    await expect(page.getByText("Your data can't be loaded")).toHaveCount(0);
  });

  await test.step("upload 5 PDFs and 1 photo for customers that don't exist yet", async () => {
    await page.goto("/app/documents");
    await expect(page.getByRole("button", { name: "Choose files" })).toBeEnabled(DATA);
    const files = await Promise.all(
      REGISTER.map(async (inv) =>
        inv.id === "T06"
          ? { name: "invoice_photo_006.png", mimeType: "image/png", buffer: await invoicePng(browser, inv) }
          : { name: `invoice_${inv.id.toLowerCase()}.pdf`, mimeType: "application/pdf", buffer: await invoicePdf(inv) },
      ),
    );
    await page.locator('input[type="file"]').setInputFiles(files);
    await expect(page).toHaveURL(/\/app\/tasks\//, { timeout: 60_000 });
    // Six real model calls; allow for slow responses and retries.
    await expect(page.getByText(/\d+ added, \d+ need review, \d+ rejected, \d+ failed/)).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText("5 added, 1 need review, 0 rejected, 0 failed.")).toBeVisible();
  });

  await test.step("statuses match the register", async () => {
    await page.goto("/app/invoices");
    const expected: Record<string, string> = {
      "OPS-QA-2026-001": "Overdue",
      "OPS-QA-2026-002": "Overdue",
      "OPS-QA-2026-003": "Paid",
      "OPS-QA-2026-004": "Open",
      "OPS-QA-2026-005": "Needs review",
      "OPS-QA-2026-006": "Overdue",
    };
    for (const [number, status] of Object.entries(expected)) {
      await expect(rowFor(page, number), number).toContainText(status, DATA);
    }
    await expect(rowFor(page, "OPS-QA-2026-001")).toContainText("₹23,600.00");
    await expect(rowFor(page, "OPS-QA-2026-006")).toContainText("₹8,850.00");

    await rowFor(page, "OPS-QA-2026-003").getByRole("link").click();
    await expect(page.getByText(/Marked PAID/)).toBeVisible();
    await page.goto("/app/invoices");
    await rowFor(page, "OPS-QA-2026-005").getByRole("link").click();
    await expect(page.getByText("Subtotal + tax does not equal total")).toBeVisible();
    await expect(page.getByText(/accounts@cedarline-demo\.example/).first()).toBeVisible(); // extracted email preserved
  });

  await test.step("clients were created from the valid invoices only", async () => {
    await page.goto("/app/clients");
    for (const name of ["Northstar Design Studio", "Maple Grove Media", "Redstone Studio", "Blue Oak Consulting", "Silverline Analytics"]) {
      await expect(page.getByRole("link", { name })).toBeVisible(DATA);
    }
    await expect(page.getByRole("link", { name: "Cedarline Works" })).toHaveCount(0);
  });

  await test.step("chase overdue invoices: drafts for exactly T01, T02, T06; sending blocked until email is configured", async () => {
    await page.goto("/app");
    await page.getByRole("button", { name: /Tell OpsPilot what to do/ }).click();
    await page.getByPlaceholder(/Chase overdue invoices/).fill("Chase all overdue invoices");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/app\/tasks\//);
    await page.getByRole("link", { name: "Review emails" }).click({ timeout: 120_000 });
    await expect(page.getByText("To billing@northstar-demo.example")).toBeVisible();
    await expect(page.getByText("To accounts@maplegrove-demo.example")).toBeVisible();
    await expect(page.getByText("To billing@silverline-demo.example")).toBeVisible();
    await expect(page.getByText(/finance@redstone-demo|ap@blueoak-demo|cedarline/)).toHaveCount(0);
    for (const amount of ["₹23,600.00", "₹11,800.00", "₹8,850.00"]) await expect(page.getByText(amount).first()).toBeVisible();
    // Local EMAIL_FROM is a gmail.com address, so the app must refuse approval and say why.
    await expect(page.getByText("Emails can't be sent yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve", exact: true }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Send \d+ approved$/ })).toHaveCount(0); // nothing pre-approved
  });

  await test.step("duplicate upload is rejected", async () => {
    await page.goto("/app/documents");
    await expect(page.getByRole("button", { name: "Choose files" })).toBeEnabled(DATA);
    await page.locator('input[type="file"]').setInputFiles({ name: "again.pdf", mimeType: "application/pdf", buffer: await invoicePdf(REGISTER[0]) });
    await expect(page.getByText(/already uploaded/).first()).toBeVisible({ timeout: 30_000 });
  });

  await test.step("data persists across sign-out and sign-in", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("correct-horse-battery-9");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app$/, DATA);
    await page.goto("/app/invoices");
    await expect(rowFor(page, "OPS-QA-2026-001")).toBeVisible(DATA);
  });

  expect(await watch.collect()).toEqual([]);
});

test("a second user sees none of the first user's data", async ({ page }) => {
  await signUpAndOnboard(page, `qa-other+${Date.now()}@opspilot-test.example`, "Other Studio");
  await page.goto("/app/invoices");
  await expect(page.getByText("No invoices yet")).toBeVisible(DATA);
  await page.goto("/app/clients");
  await expect(page.getByText("No clients yet")).toBeVisible(DATA);
});
