import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { AuthGate } from "./auth-gate";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

const Clinical = vi.fn(() => <p>clinical screen</p>);
const gated = () => (
  <AuthGate>
    <Clinical />
  </AuthGate>
);

describe("AuthGate", () => {
  it("shows the clinical app to a signed-in clinician", () => {
    renderWithAuth(gated());
    expect(screen.getByText("clinical screen")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
  it("sends a signed-out visitor to sign in, mounting nothing", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(Clinical).not.toHaveBeenCalled();
  });
  it("sends an admin to the 403 page, mounting nothing clinical", async () => {
    Clinical.mockClear();
    renderWithAuth(gated(), { ...TEST_USER, role: "admin" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/no-access"));
    expect(Clinical).not.toHaveBeenCalled();
  });
});
