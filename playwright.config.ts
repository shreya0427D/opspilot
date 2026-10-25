import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against a running app (default: local production build on the emulators).
// Start: `npm run dev:emulators`, then `npm run build && npm run start -- -p 3300`, then `npm run test:e2e`.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3300",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
});
