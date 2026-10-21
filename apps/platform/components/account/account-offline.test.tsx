import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { renderWithAuth, testAuthClient } from "@/tests/render";
import { OfflineStrip } from "../states/offline-strip";
import { AccountView } from "./account-view";

vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/account",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const REASON = "You're offline. This needs a connection.";

async function signedIn() {
  const client = testAuthClient();
  await client.signIn(TEAM_EMAILS.ada, "pw");
  await client.verifyCode("123456", { backup: false });
  return { client, user: (await client.getSession())!.user };
}

describe("offline", () => {
  it("the offline strip shows", () => {
    renderWithAuth(<OfflineStrip />);
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
  });

  it("account actions are disabled and the reason is shown and described", async () => {
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    expect(screen.getAllByText(REASON)[0]).toBeVisible();
    for (const name of [
      "Change password",
      "New backup codes",
      "Sign out everywhere",
    ]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(REASON);
    }
  });

  it("the Sign out everywhere confirm button is disabled too", async () => {
    // Opened while online is impossible here, so check the dialog's own button.
    const { client, user } = await signedIn();
    renderWithAuth(<AccountView />, { client, user });
    const dialog = screen
      .getByRole("heading", { name: "Sign out everywhere?", hidden: true })
      .closest("dialog")!;
    const b = within(dialog).getByRole("button", {
      name: "Sign out everywhere",
      hidden: true,
    });
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription(REASON);
  });
});
