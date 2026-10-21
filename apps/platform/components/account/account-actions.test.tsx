import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { MOCK_NEW_BACKUP_CODES } from "@/lib/auth/mock";
import { auth, GrabAuth, renderWithAuth, testAuthClient } from "@/tests/render";
import { AccountView } from "./account-view";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useRouter: () => ({ push: vi.fn(), replace }),
}));

async function signedIn() {
  const client = testAuthClient();
  await client.signIn(TEAM_EMAILS.ada, "pw");
  await client.verifyCode("123456", { backup: false });
  return { client, user: (await client.getSession())!.user };
}

const fillPasswords = async (
  u: ReturnType<typeof userEvent.setup>,
  current: string,
) => {
  await u.type(screen.getByLabelText("Current password"), current);
  await u.type(screen.getByLabelText("New password"), "Violet-river-lamp-42");
  await u.type(
    screen.getByLabelText("Confirm password"),
    "Violet-river-lamp-42",
  );
  await u.click(screen.getByRole("button", { name: "Save password" }));
};

describe("Account actions", () => {
  it("changing the password shows a confirmation and closes", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    await u.click(screen.getByRole("button", { name: "Change password" }));
    await fillPasswords(u, "old-password-1");
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText("Current password")).not.toBeVisible(),
    );
  });

  it("a wrong current password says so and stays open", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    await u.click(screen.getByRole("button", { name: "Change password" }));
    await fillPasswords(u, "wrong");
    expect(
      await screen.findByText("That isn't your current password."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Password changed")).toBeNull();
  });

  it("Sign out everywhere asks first, then signs out", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    renderWithAuth(
      <>
        <GrabAuth />
        <AccountView />
      </>,
      { client, user },
    );
    await screen.findByText("Firefox on macOS");
    await u.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    const dialog = screen
      .getByRole("heading", { name: "Sign out everywhere?" })
      .closest("dialog")!;
    expect(auth.current.status).toBe("signed_in");
    await u.click(
      within(dialog).getByRole("button", { name: "Sign out everywhere" }),
    );
    await waitFor(() => expect(auth.current.status).toBe("signed_out"));
    expect(replace).toHaveBeenCalledWith("/sign-in");
  });

  it("new backup codes stay until saved: Escape does not close them", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    await u.click(screen.getByRole("button", { name: "New backup codes" }));
    await u.click(screen.getByRole("button", { name: "Get new codes" }));
    const code = await screen.findByText(MOCK_NEW_BACKUP_CODES[0]!);
    const dialog = code.closest("dialog")!;
    await u.keyboard("{Escape}");
    expect(code).toBeVisible();
    expect(dialog).toHaveAttribute("open");
    const done = within(dialog).getByRole("button", { name: "Done" });
    expect(done).toBeDisabled();
    await u.click(within(dialog).getByRole("checkbox"));
    await u.click(done);
    expect(screen.queryByText(MOCK_NEW_BACKUP_CODES[0]!)).toBeNull();
  });

  it("a double click signs a device out once", async () => {
    const u = userEvent.setup();
    const { client, user } = await signedIn();
    const spy = vi.spyOn(client, "signOutDevice");
    renderWithAuth(<AccountView />, { client, user });
    await screen.findByText("Firefox on macOS");
    await u.dblClick(
      screen.getByRole("button", { name: "Sign out Firefox on macOS" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Firefox on macOS")).toBeNull(),
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
