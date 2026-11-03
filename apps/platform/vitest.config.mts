import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// Dates in tests read the same on every machine.
process.env.TZ ??= "UTC";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // `server-only` throws outside a React Server build; tests import the
  // server modules directly, so they get its empty build.
  resolve: {
    alias: [
      {
        find: /^server-only$/,
        replacement: fileURLToPath(
          new URL("../../node_modules/server-only/empty.js", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "tests/e2e/**", "tests/e2e-live/**", ".next"],
    testTimeout: 15_000,
  },
});
