import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `server-only` throws outside a React Server build; tests import the
// server modules directly, so they get its empty build.
export const serverOnlyAlias = {
  find: /^server-only$/,
  replacement: fileURLToPath(
    new URL("../../node_modules/server-only/empty.js", import.meta.url),
  ),
};

export default defineConfig({
  resolve: { alias: [serverOnlyAlias] },
  test: {
    // jsdom for the network hooks; the server modules only need Node.
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
