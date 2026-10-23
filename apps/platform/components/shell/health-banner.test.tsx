import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import type { HealthMode } from "@/lib/api/ops-fixtures";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, renderWithAuth } from "@/tests/render";
import { HealthBanner } from "./health-banner";

const env = vi.hoisted(() => ({ online: true, path: "/hospitals" }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => env.online }));
vi.mock("next/navigation", () => ({
  usePathname: () => env.path,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function install(health: HealthMode) {
  __setPlatformClientForTests(
    createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      stepUp: createStepUp(),
      health,
    }),
  );
}
beforeEach(() => {
  env.path = "/hospitals";
  env.online = true;
});
afterEach(() => {
  vi.useRealTimers();
  __resetPlatformClientForTests();
});

const TEXT = /The service is having problems/;

describe("the service-problems banner", () => {
  it("shows on Having problems and links to Health", async () => {
    install("problem");
    renderWithAuth(<HealthBanner />, { user: ADA });
    const b = await screen.findByText(TEXT);
    expect(b).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View health" })).toHaveAttribute(
      "href",
      "/system/health",
    );
  });

  it.each(["normal", "slow"] as const)("hides on %s", async (m) => {
    install(m);
    renderWithAuth(<HealthBanner />, { user: ADA });
    await act(async () => {});
    await waitFor(() => expect(screen.queryByText(TEXT)).toBeNull());
    expect(screen.queryByRole("link", { name: "View health" })).toBeNull();
  });

  it.each(["stale", "unavailable"] as const)(
    "hides on Couldn't check (%s)",
    async (m) => {
      install(m);
      renderWithAuth(<HealthBanner />, { user: ADA });
      await act(async () => {});
      expect(screen.queryByText(TEXT)).toBeNull();
    },
  );

  it("hides on the Health page", async () => {
    install("problem");
    env.path = "/system/health";
    renderWithAuth(<HealthBanner />, { user: ADA });
    await act(async () => {});
    expect(screen.queryByText(TEXT)).toBeNull();
  });
});
