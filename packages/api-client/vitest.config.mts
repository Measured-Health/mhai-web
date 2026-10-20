import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // jsdom for the network hooks; the server modules only need Node.
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
