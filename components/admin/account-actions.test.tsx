import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS, MOCK_BACKUP_CODES, MOCK_CODE } from "@/lib/auth/mock";
import { LAST_ADMIN } from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { screenAdminAs } from "@/tests/admin";
import { DIRECTOR, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { StaffPanel } from "./staff-panel";

const onClose = vi.fn();
beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  onClose.mockReset();
});
afterEach(() => vi.restoreAllMocks());

async function open(id: string, user = DIRECTOR) {
  renderAdmin(<StaffPanel staffId={id} onClose={onClose} />, user);
  const panel = await screen.findByRole("dialog", { name: "Staff member" });
  const account = await within(panel).findByRole("region", { name: "Account" });
  return { panel, account };
}
const confirmIn = (name: string) => screen.getByRole("dialog", { name });
const onList = async (id: string) =>
  (await holder.client.listStaff()).some((s) => s.id === id);

async function askRemove(id = "s-bello") {
  const { account } = await open(id);
  await userEvent.click(
    within(account).getByRole("button", { name: "Remove" }),
  );
  return confirmIn("Remove this account?");
}

describe("AccountActions", () => {
  it("deactivates after a confirmation whose safe button has the focus, then reactivates", async () => {
    const { panel, account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    const dialog = confirmIn("Deactivate this account?");
    expect(
      within(dialog).getByText(/Dr. Tunde Bello can't sign in from now on/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Keep account" }),
    ).toHaveFocus();
    // Deactivating needs no two-step code.
    expect(within(dialog).queryByLabelText("Digit 1 of 6")).toBeNull();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    );
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    expect(await within(panel).findByText("Deactivated")).toBeInTheDocument();
    await userEvent.click(
      await within(account).findByRole("button", { name: "Reactivate" }),
    );
    expect(await screen.findByText("Account reactivated")).toBeInTheDocument();
    expect(await within(panel).findByText("Active")).toBeInTheDocument();
  });

  it("Keep account changes nothing", async () => {
    const action = vi.spyOn(holder.client, "staffAction");
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    await userEvent.click(
      within(confirmIn("Deactivate this account?")).getByRole("button", {
        name: "Keep account",
      }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Deactivate this account?" }),
    ).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("you can't deactivate or remove yourself (Review Focus 1)", async () => {
    const { account } = await open("s-obi");
    const deactivate = within(account).getByRole("button", {
      name: "Deactivate",
    });
    expect(deactivate).toBeDisabled();
    expect(deactivate).toHaveAccessibleDescription(
      "You can't deactivate your own account. Ask another hospital admin.",
    );
    const remove = within(account).getByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAccessibleDescription(
      "You can't remove your own account. Ask another hospital admin.",
    );
  });

  it("the last admin can't be deactivated or removed (Review Focus 4)", async () => {
    holder.client = screenAdminAs(null);
    await holder.client.staffAction("s-nwosu", "deactivate");
    const { account } = await open("s-obi");
    for (const name of ["Deactivate", "Remove"]) {
      const b = within(account).getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(LAST_ADMIN);
    }
  });

  it("shows an API refusal in plain words, in the dialog", async () => {
    vi.spyOn(holder.client, "staffAction").mockRejectedValueOnce(
      new ApiError(403, "self_change"),
    );
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    const dialog = confirmIn("Deactivate this account?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    );
    expect(
      await within(dialog).findByText("You can't change your own access"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/self_change/)).toBeNull();
  });

  it("removes with your two-step code, after a confirmation that names the person, and closes the panel", async () => {
    const remove = vi.spyOn(holder.client, "removeStaff");
    const { account } = await open("s-eze");
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = confirmIn("Remove this account?");
    expect(
      within(dialog).getByText(/Dr. James Eze \(j\.eze@havanahospital\.org\)/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/This can't be undone/),
    ).toBeInTheDocument();
    // The safe button keeps the focus, even with the code boxes above it.
    expect(
      within(dialog).getByRole("button", { name: "Keep account" }),
    ).toHaveFocus();
    const confirm = within(dialog).getByRole("button", {
      name: "Remove account",
    });
    expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("12345");
    expect(confirm).toBeDisabled();
    expect(remove).not.toHaveBeenCalled();
    // The sixth digit submits on its own.
    await userEvent.keyboard("6");
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(
      "s-eze",
      { mfaCode: MOCK_CODE },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(await onList("s-eze")).toBe(false);
  });

  it("a wrong code keeps the person and the dialog, and says so", async () => {
    const dialog = await askRemove();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("000000");
    expect(
      await within(dialog).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(confirmIn("Remove this account?")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveFocus();
    expect(screen.queryByText("Account removed")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(await onList("s-bello")).toBe(true);
  });

  it("too many tries shows the lockout wording", async () => {
    vi.spyOn(holder.client, "removeStaff").mockRejectedValueOnce(
      new ApiError(429, "mfa_locked"),
    );
    const dialog = await askRemove();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    expect(
      await within(dialog).findByText(
        "Too many tries. Wait 15 minutes, then try again.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/mfa_locked/)).toBeNull();
    expect(await onList("s-bello")).toBe(true);
  });

  it("without two-step you can't remove, and are pointed to Profile & security", async () => {
    const remove = vi.spyOn(holder.client, "removeStaff");
    const { account } = await open("s-bello", {
      ...DIRECTOR,
      mfaEnabled: false,
    });
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = confirmIn("Remove this account?");
    expect(
      within(dialog).getByText(
        "Turn on two-step verification in Profile & security to remove staff.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Profile & security" }),
    ).toHaveAttribute("href", "/account");
    expect(within(dialog).queryByLabelText("Digit 1 of 6")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Keep account" }),
    ).toHaveFocus();
    expect(
      within(dialog).getByRole("button", { name: "Remove account" }),
    ).toBeDisabled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("an API answer of no two-step blocks the removal the same way", async () => {
    vi.spyOn(holder.client, "removeStaff").mockRejectedValueOnce(
      new ApiError(403, "mfa_required"),
    );
    const dialog = await askRemove();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    expect(
      await within(dialog).findByRole("link", { name: "Profile & security" }),
    ).toHaveAttribute("href", "/account");
    expect(within(dialog).queryByLabelText("Digit 1 of 6")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Remove account" }),
    ).toBeDisabled();
    expect(await onList("s-bello")).toBe(true);
  });

  it("removes with a backup code instead", async () => {
    const remove = vi.spyOn(holder.client, "removeStaff");
    const dialog = await askRemove();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Use a backup code" }),
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Remove account",
    });
    expect(confirm).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[2]!.toLowerCase().replace("-", ""),
    );
    await userEvent.click(confirm);
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(
      "s-bello",
      { backupCode: MOCK_BACKUP_CODES[2] },
      expect.anything(),
    );
    expect(await onList("s-bello")).toBe(false);
  });

  it("cancels an invite with your two-step code", async () => {
    const { account } = await open("s-adeyemi");
    expect(
      within(account).queryByRole("button", { name: "Deactivate" }),
    ).toBeNull();
    await userEvent.click(
      within(account).getByRole("button", { name: "Cancel invite" }),
    );
    const dialog = confirmIn("Cancel this invite?");
    expect(
      within(dialog).getByRole("button", { name: "Keep invite" }),
    ).toHaveFocus();
    expect(
      within(dialog).getByRole("button", { name: "Cancel invite" }),
    ).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    expect(await screen.findByText("Invite cancelled")).toBeInTheDocument();
    expect(await onList("s-adeyemi")).toBe(false);
  });

  it("resends an expired invite", async () => {
    const { account } = await open("s-sani");
    await userEvent.click(
      within(account).getByRole("button", { name: "Send a new invite" }),
    );
    expect(await screen.findByText("New invite sent")).toBeInTheDocument();
  });

  it("sends a password reset and resets two-step only for password sign-in", async () => {
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Send password reset" }),
    );
    await userEvent.click(
      within(confirmIn("Send a password reset?")).getByRole("button", {
        name: "Send reset link",
      }),
    );
    expect(await screen.findByText("Reset link sent")).toBeInTheDocument();
    await userEvent.click(
      within(account).getByRole("button", { name: "Reset two-step" }),
    );
    await userEvent.click(
      within(confirmIn("Reset two-step verification?")).getByRole("button", {
        name: "Reset two-step",
      }),
    );
    expect(await screen.findByText("Two-step reset")).toBeInTheDocument();
  });

  it("explains why a hospital-account person has no password actions", async () => {
    const { account } = await open("s-okafor");
    expect(
      within(account).queryByRole("button", { name: "Send password reset" }),
    ).toBeNull();
    expect(
      within(account).getByText(
        "Signs in with their hospital account. Their password and two-step are managed by the hospital.",
      ),
    ).toBeInTheDocument();
  });

  it("reminds from the policy warning", async () => {
    const { panel } = await open("s-mensah");
    await userEvent.click(
      within(panel).getByRole("button", { name: "Send a reminder" }),
    );
    expect(await screen.findByText("Reminder sent")).toBeInTheDocument();
  });

  it("Esc closes the confirmation first, then the panel", async () => {
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    // jsdom has no top layer; say what a browser would for showModal().
    const d = confirmIn("Deactivate this account?") as HTMLDialogElement;
    d.matches = (q: string) => q === ":modal";
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Deactivate this account?" }),
      ).toBeNull(),
    );
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("disables every action offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { account } = await open("s-bello");
    expect(
      within(account).getByText(
        "You're offline. Account changes need a connection.",
      ),
    ).toBeInTheDocument();
    for (const b of within(account).getAllByRole("button"))
      expect(b).toBeDisabled();
  });

  it("while a removal is in flight, Keep is off and Esc is ignored; the toast still shows", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = holder.client.removeStaff.bind(holder.client);
    vi.spyOn(holder.client, "removeStaff").mockImplementation(async (...a) => {
      await gate;
      return real(...a);
    });
    // A parent that really closes the panel, as the Staff page does.
    function Host() {
      const [id, setId] = useState<string | null>("s-eze");
      return (
        <StaffPanel
          staffId={id}
          onClose={() => {
            onClose();
            setId(null);
          }}
        />
      );
    }
    renderAdmin(<Host />, DIRECTOR);
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    const account = await within(panel).findByRole("region", {
      name: "Account",
    });
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = confirmIn("Remove this account?") as HTMLDialogElement;
    // jsdom has no top layer; say what a browser would for showModal().
    const matches = dialog.matches.bind(dialog);
    dialog.matches = (q: string) => q === ":modal" || matches(q);
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    const keep = within(dialog).getByRole("button", { name: "Keep account" });
    await waitFor(() => expect(keep).toBeDisabled());
    await userEvent.keyboard("{Escape}");
    expect(confirmIn("Remove this account?")).toBeInTheDocument();
    await act(async () => release());
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByText(/Someone else may have removed them/)).toBeNull();
  });

  it("forgets the two-step code once the dialog closes", async () => {
    let qc!: QueryClient;
    function Probe() {
      qc = useQueryClient();
      return null;
    }
    const withCode = () =>
      qc
        .getMutationCache()
        .getAll()
        .filter((m) =>
          /mfaCode|backupCode/.test(JSON.stringify(m.state.variables ?? {})),
        );
    renderAdmin(
      <>
        <StaffPanel staffId="s-bello" onClose={onClose} />
        <Probe />
      </>,
    );
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    const account = await within(panel).findByRole("region", {
      name: "Account",
    });
    // A wrong code, then Keep account.
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    let dialog = confirmIn("Remove this account?");
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("000000");
    await within(dialog).findByText("That code didn't work. Try again.");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Keep account" }),
    );
    await waitFor(() => expect(withCode()).toEqual([]));
    // A right code: the person is removed and the panel's actions go away.
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    dialog = confirmIn("Remove this account?");
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    await waitFor(() => expect(withCode()).toEqual([]));
  });

  it("the sixth digit and a quick Enter or click send one request", async () => {
    const remove = vi.spyOn(holder.client, "removeStaff");
    const dialog = await askRemove();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("12345");
    const confirm = within(dialog).getByRole("button", {
      name: "Remove account",
    });
    // The sixth digit submits on its own; a click lands before the re-render.
    act(() => {
      fireEvent.change(within(dialog).getByLabelText("Digit 6 of 6"), {
        target: { value: "6" },
      });
    });
    fireEvent.click(confirm);
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("two submits in the same moment send one request (one key)", async () => {
    const remove = vi.spyOn(holder.client, "removeStaff");
    const dialog = await askRemove();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Use a backup code" }),
    );
    await userEvent.type(
      within(dialog).getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[3]!,
    );
    const confirm = within(dialog).getByRole("button", {
      name: "Remove account",
    });
    // A click and an Enter that land before React re-renders.
    act(() => {
      confirm.click();
      confirm.click();
    });
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("Esc and open again: the code boxes are empty", async () => {
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const d = confirmIn("Remove this account?") as HTMLDialogElement;
    d.matches = (q: string) => q === ":modal";
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Remove this account?" }),
      ).toBeNull(),
    );
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const again = confirmIn("Remove this account?");
    for (let i = 1; i <= 6; i++)
      expect(within(again).getByLabelText(`Digit ${i} of 6`)).toHaveValue("");
  });

  it("removing with a backup code lowers your backup codes left", async () => {
    function Left() {
      const { user } = useAuth();
      return <p>Backup codes left: {user?.backupCodesLeft}</p>;
    }
    renderAdmin(
      <>
        <StaffPanel staffId="s-bello" onClose={onClose} />
        <Left />
      </>,
    );
    expect(screen.getByText("Backup codes left: 8")).toBeInTheDocument();
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    const account = await within(panel).findByRole("region", {
      name: "Account",
    });
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = confirmIn("Remove this account?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Use a backup code" }),
    );
    await userEvent.type(
      within(dialog).getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[1]!,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Remove account" }),
    );
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(await screen.findByText("Backup codes left: 7")).toBeInTheDocument();
  });
});
