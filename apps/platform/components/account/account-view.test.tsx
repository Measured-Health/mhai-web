import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { MOCK_BACKUP_CODES } from "@/lib/api/step-up";
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
    expect(
      screen.getByText(/Use it if you don't have your phone/),
    ).toBeInTheDocument();
    expect(screen.queryByText("You have no backup code")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /turn off|disable|set up/i }),
    ).toBeNull();
    expect(document.body.textContent).not.toMatch(/trust/i);
  });

  it("makes a new backup code with the current backup code, shown once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    try {
      const { client, user } = await signedIn();
      renderWithAuth(<AccountView />, { client, user });
      await u.click(
        screen.getByRole("button", { name: "Make a new backup code" }),
      );
      const ask = screen.getByRole("dialog", { name: "New backup code" });
      await u.click(
        within(ask).getByRole("button", { name: "Use a backup code" }),
      );
      await u.type(
        within(ask).getByLabelText("Backup code"),
        MOCK_BACKUP_CODES[0],
      );
      await u.click(
        within(ask).getByRole("button", { name: "Make a new backup code" }),
      );
      const shown = await screen.findByRole("group", {
        name: "Your backup code",
      });
      expect(shown).toHaveTextContent(MOCK_BACKUP_CODES[1]);
      act(() => vi.advanceTimersByTime(3000));
      await u.click(screen.getByRole("button", { name: "Continue" }));
      expect(screen.queryByText(MOCK_BACKUP_CODES[1])).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("warns when no backup code is ready, with one way to make one", async () => {
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, {
      client,
      user: { ...user, backupCodesLeft: 0 },
    });
    expect(screen.getByText("You have no backup code")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Make a new backup code" }),
    ).toHaveLength(1);
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
