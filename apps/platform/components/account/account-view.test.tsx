import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { MOCK_NEW_BACKUP_CODES } from "@/lib/auth/mock";
import { renderWithAuth, testAuthClient } from "@/tests/render";
import { AccountView } from "./account-view";

vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

async function signedIn() {
  const client = testAuthClient();
  await client.signIn(TEAM_EMAILS.ada, "pw");
  await client.verifyCode("123456", { backup: false });
  const s = (await client.getSession())!;
  return { client, user: s.user };
}

describe("Account", () => {
  it("shows two-step On with no turn-off control", async () => {
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    expect(screen.getByText("Ada Bakare")).toBeInTheDocument();
    expect(screen.getByText("Platform admin")).toBeInTheDocument();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText("10 left")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /turn off|disable|set up/i }),
    ).toBeNull();
    expect(document.body.textContent).not.toMatch(/trust/i);
  });

  it("New backup codes shows the new codes once", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    await u.click(screen.getByRole("button", { name: "New backup codes" }));
    await u.click(screen.getByRole("button", { name: "Get new codes" }));
    const dialog = (await screen.findByText(MOCK_NEW_BACKUP_CODES[0]!)).closest(
      "dialog",
    )!;
    for (const c of MOCK_NEW_BACKUP_CODES)
      expect(within(dialog).getByText(c)).toBeInTheDocument();
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(within(dialog).getByRole("button", { name: "Done" }));
    expect(screen.queryByText(MOCK_NEW_BACKUP_CODES[0]!)).toBeNull();
  });

  it("signing out a device removes it", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    expect(await screen.findByText("Firefox on macOS")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    await u.click(
      screen.getByRole("button", { name: "Sign out Firefox on macOS" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Firefox on macOS")).toBeNull(),
    );
    expect(screen.getByText("Chrome on Windows")).toBeInTheDocument();
  });
});
