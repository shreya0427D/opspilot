import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs against the Firebase Emulators. Use `npm run test:emulator`, which starts them.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/emulator/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
