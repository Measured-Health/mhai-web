import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { NoAccess } from "./no-access";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());
afterEach(() => vi.unstubAllEnvs());
const ADMIN = { ...TEST_USER, role: "admin" as const };

describe("NoAccess", () => {
  it("explains the 403 and offers sign out", async () => {
    renderWithAuth(<NoAccess />, ADMIN);
    expect(
      screen.getByRole("heading", { name: "You don't have access" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Error 403")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Go to admin app" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
  it("links to the admin app when its address is set", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_APP_URL", "https://admin.example.org");
    renderWithAuth(<NoAccess />, ADMIN);
    expect(
      screen.getByRole("link", { name: "Go to admin app" }),
    ).toHaveAttribute("href", "https://admin.example.org");
  });
  it("sends a clinician home and a visitor to sign in", async () => {
    const { unmount } = renderWithAuth(<NoAccess />, TEST_USER);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    unmount();
    renderWithAuth(<NoAccess />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});
