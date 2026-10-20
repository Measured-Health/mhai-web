import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { SignedOutNotice } from "@/components/states/signed-out-notice";
import { reportUnauthorized } from "./events";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("session expiry", () => {
  it("signs out once for a burst of 401s, and says the session ended", async () => {
    renderWithAuth(<SignedOutNotice />);
    await act(async () => {
      reportUnauthorized();
      reportUnauthorized();
      reportUnauthorized();
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(screen.getByText("Your session ended")).toBeInTheDocument();
  });
});
