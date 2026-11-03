import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

/**
 * The live e2e (Task 9 of the BFF over NATS plan): this app built for live
 * mode against the backend's smoke stack, on the transport in
 * BACKEND_TRANSPORT. Build server only, through scripts/it/e2e-live.sh,
 * which sets the stack's addresses and files. Synthetic data only.
 */
const PORT = 3201;
const state = process.env.MHAI_IT_STATE ?? "/state";
const transport = process.env.BACKEND_TRANSPORT ?? "http";

export default defineConfig({
  testDir: "tests/e2e-live",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    // Through the loopback proxy, as the live preview is reached
    // (deploy/nginx/live-proxy.conf.template): it sets X-Real-IP, which core
    // needs for sign-in. No header is injected here.
    baseURL: process.env.E2E_LIVE_BASE_URL ?? `http://localhost:${PORT}`,
    // The question holds (synthetic) patient details: no screenshots or video.
    trace: "retain-on-failure",
    screenshot: "off",
    video: "off",
  },
  webServer: {
    // e2e-live.sh builds once and runs both transports on that build.
    command: process.env.E2E_LIVE_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/sign-in`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_USE_MOCK: "false",
      BACKEND_TRANSPORT: transport,
      MHAI_DEPLOY_ENV: "development",
      TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
      // Above the access token's 15 minutes: every call refreshes, so the
      // run rotates core's refresh token many times, concurrently too.
      SESSION_REFRESH_WITHIN_S: "1200",
      PLATFORM_SESSION_SECRET: randomBytes(36).toString("base64url"),
      ...(transport === "nats"
        ? {
            NATS_URL: process.env.MHAI_IT_NATS_URL ?? "nats://nats:4222",
            NATS_USER: "bff_platform",
            NATS_PASSWORD_FILE: `${state}/bff_platform.pass`,
          }
        : {
            MHAI_API_URL: process.env.MHAI_IT_CORE_URL ?? "http://core:8080",
            BFF_SERVICE_KEY_FILE: `${state}/service.key`,
          }),
    },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
