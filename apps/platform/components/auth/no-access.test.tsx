import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADA,
  auth,
  GrabAuth,
  renderWithAuth,
  testAuthClient,
} from "@/tests/render";
import { NoAccess, NoAccessPage } from "./no-access";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

describe("NoAccess", () => {
  it("says the account can't use the app and offers sign-in", () => {
    renderWithAuth(<NoAccess />, { user: null });
    expect(
      screen.getByRole("heading", { name: "You don't have access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("This account can't use the platform admin app."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Sign in with another account" }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("the /no-access page shows the same content and signs out", async () => {
    const client = testAuthClient();
    const signOut = vi.spyOn(client, "signOut");
    renderWithAuth(
      <>
        <GrabAuth />
        <NoAccessPage />
      </>,
      { user: { ...ADA, roles: [] }, client },
    );
    expect(
      screen.getByText("This account can't use the platform admin app."),
    ).toBeInTheDocument();
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
    expect(signOut).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
