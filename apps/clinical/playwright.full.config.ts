import { defineConfig, devices } from "@playwright/test";

/**
 * The full live check (scripts/it/live-full.sh): this app built for live
 * mode, already running behind the live preview's proxy, against core,
 * the EMR service and a synthetic FHIR source. Playwright shares the
 * proxy's network: the clinical app is http://localhost:8080, the platform
 * app http://localhost:8081. Build server only; synthetic data only.
 * Screenshots stay on the build server (LIVE_OUT).
 */
const out = process.env.LIVE_OUT ?? "/out";
const app = "clinical" as "clinical" | "platform";

export default defineConfig({
  testDir: "tests/e2e-full",
  outputDir: `${out}/${app}-results`,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: `${out}/${app}-report.json` }]],
  use: {
    baseURL:
      app === "clinical" ? "http://localhost:8080" : "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "on",
    video: "off",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: "setup", testMatch: /setup\.spec\.ts/ },
    { name: "live", testMatch: /\d\d-.*\.spec\.ts/ },
  ],
});
