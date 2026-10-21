import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, renderWithAuth } from "@/tests/render";
import { SsoSection } from "./sso-section";

vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => false }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() =>
  __setPlatformClientForTests(
    createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      stepUp: createStepUp(),
    }),
  ),
);
afterEach(() => __resetPlatformClientForTests());

describe("single sign-on while offline", () => {
  it("disables Save and Test sign-in and says why", async () => {
    renderWithAuth(<SsoSection hospitalId="h_northgate" />);
    await screen.findByText("Saved · ends ··3f2a");
    const reason = "You're offline. This needs a connection.";
    for (const name of ["Save", "Test sign-in"]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(reason);
    }
  });
});
