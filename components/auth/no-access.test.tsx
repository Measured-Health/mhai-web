import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxProvider } from "@/lib/offline/outbox-context";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { outboxCount, resetOutbox, seedOutbox } from "@/tests/outbox";
import { NoAccess } from "./no-access";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const ADMIN = { ...TEST_USER, roles: ["admin" as const] };

describe("NoAccess", () => {
  it("explains the 403 for a platform account and offers sign out", async () => {
    renderWithAuth(<NoAccess />, ADMIN);
    expect(
      screen.getByRole("heading", { name: "You don't have access" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This app is for hospital staff. Measured Health platform admin and auditor accounts use the platform admin app.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Error 403")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Go to the platform admin app" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
  it("Sign out deletes this user's unsent items from the device", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false); // no sync
    await resetOutbox();
    await seedOutbox(ADMIN.username);
    renderWithAuth(
      <OutboxProvider>
        <NoAccess />
      </OutboxProvider>,
      ADMIN,
    );
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
    expect(await outboxCount(ADMIN.username)).toBe(0);
  });
  it("links to the platform admin app when its address is set", () => {
    vi.stubEnv("NEXT_PUBLIC_ADMIN_APP_URL", "https://admin.example.org");
    renderWithAuth(<NoAccess />, ADMIN);
    expect(
      screen.getByRole("link", { name: "Go to the platform admin app" }),
    ).toHaveAttribute("href", "https://admin.example.org");
  });
  it("sends a hospital admin to the admin side, not the 403 page", async () => {
    renderWithAuth(<NoAccess />, { ...TEST_USER, roles: ["hospital_admin"] });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
    expect(screen.queryByText("Error 403")).toBeNull();
  });
  it("sends a clinician home and a visitor to sign in", async () => {
    const { unmount } = renderWithAuth(<NoAccess />, TEST_USER);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    unmount();
    renderWithAuth(<NoAccess />, null);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/sign-in"));
  });
});
