import { defineConfig, devices } from "@playwright/test";

/**
 * The public demo in live mode, end to end (deploy/README.md, "Public demo
 * in live mode"): against DEMO_BASE_URL (https://ai.measured-health.org,
 * or the build server's live stack), with the seeded demo accounts and the
 * sample AI. Synthetic questions only, so the run is recorded on video.
 */
export default defineConfig({
  testDir: "tests/e2e-demo",
  outputDir: process.env.DEMO_OUT ?? "test-results/demo",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "https://ai.measured-health.org",
    actionTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "on",
    video: { mode: "on", size: { width: 1280, height: 800 } },
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
  },
});
