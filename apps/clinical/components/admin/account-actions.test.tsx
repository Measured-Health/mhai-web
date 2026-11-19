import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS, MOCK_BACKUP_CODES, MOCK_CODE } from "@/lib/auth/mock";
import { LAST_ADMIN } from "@/lib/admin/staff";
import { useAuth } from "@/lib/auth/auth-context";
import { CODE, screenAdminAs } from "@/tests/admin";
import { DIRECTOR, enterCode, renderAdmin } from "@/tests/admin-render";

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
const statusOf = async (id: string) =>
  (await holder.client.listStaff()).find((s) => s.id === id)?.status;

async function askDeactivate(id = "s-bello") {
  const { account, panel } = await open(id);
  await userEvent.click(
    within(account).getByRole("button", { name: "Deactivate" }),
  );
  return { dialog: confirmIn("Deactivate this account?"), account, panel };
}

describe("AccountActions (core 1.24.0: step-up on every staff write)", () => {
  it("deactivates with your code, after a confirmation whose safe button has the focus, then reactivates with it", async () => {
    const action = vi.spyOn(holder.client, "staffAction");
    const { dialog, account, panel } = await askDeactivate();
    expect(
      within(dialog).getByText(/Dr. Tunde Bello can't sign in from now on/),
    ).toBeInTheDocument();
    // The safe button keeps the focus, even with the code boxes above it.
    expect(
      within(dialog).getByRole("button", { name: "Keep account" }),
    ).toHaveFocus();
    const confirm = within(dialog).getByRole("button", { name: "Deactivate" });
    expect(confirm).toBeDisabled();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("12345");
    expect(confirm).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
    // The sixth digit submits on its own.
    await userEvent.keyboard("6");
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    expect(action).toHaveBeenCalledWith(
      "s-bello",
      "deactivate",
      { mfaCode: MOCK_CODE },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(await within(panel).findByText("Deactivated")).toBeInTheDocument();
    await userEvent.click(
      await within(account).findByRole("button", { name: "Reactivate" }),
    );
    await enterCode(confirmIn("Reactivate this account?"), MOCK_CODE);
    expect(await screen.findByText("Account reactivated")).toBeInTheDocument();
    expect(await within(panel).findByText("Active")).toBeInTheDocument();
  });

  it("Keep account changes nothing", async () => {
    const action = vi.spyOn(holder.client, "staffAction");
    const { dialog } = await askDeactivate();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Keep account" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Deactivate this account?" }),
    ).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("you can't deactivate yourself (Review Focus 1)", async () => {
    const { account } = await open("s-obi");
    const deactivate = within(account).getByRole("button", {
      name: "Deactivate",
    });
    expect(deactivate).toBeDisabled();
    expect(deactivate).toHaveAccessibleDescription(
      "You can't deactivate your own account. Ask another hospital admin.",
    );
  });

  it("the last admin can't be deactivated (Review Focus 4)", async () => {
    holder.client = screenAdminAs(null);
    await holder.client.staffAction("s-nwosu", "deactivate", CODE);
    const { account } = await open("s-obi");
    const b = within(account).getByRole("button", { name: "Deactivate" });
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription(LAST_ADMIN);
  });

  it("shows an API refusal in plain words, in the dialog", async () => {
    vi.spyOn(holder.client, "staffAction").mockRejectedValueOnce(
      new ApiError(409, "last_admin"),
    );
    const { dialog } = await askDeactivate();
    await enterCode(dialog, MOCK_CODE);
    expect(
      await within(dialog).findByText("The hospital needs a hospital admin"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/last_admin/)).toBeNull();
  });

  it("a wrong code keeps the person and the dialog, and says so", async () => {
    const { dialog } = await askDeactivate();
    await enterCode(dialog, "000000");
    expect(
      await within(dialog).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(confirmIn("Deactivate this account?")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveFocus();
    expect(screen.queryByText("Account deactivated")).toBeNull();
    expect(await statusOf("s-bello")).toBe("active");
  });

  it("too many tries shows the lockout wording", async () => {
    vi.spyOn(holder.client, "staffAction").mockRejectedValueOnce(
      new ApiError(429, "mfa_locked"),
    );
    const { dialog } = await askDeactivate();
    await enterCode(dialog, MOCK_CODE);
    expect(
      await within(dialog).findByText(
        "Too many tries. Wait 15 minutes, then try again.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/mfa_locked/)).toBeNull();
  });

  it("without two-step you can't deactivate, and are pointed to Profile & security", async () => {
    const action = vi.spyOn(holder.client, "staffAction");
    const { account } = await open("s-bello", {
      ...DIRECTOR,
      mfaEnabled: false,
    });
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    const dialog = confirmIn("Deactivate this account?");
    expect(
      within(dialog).getByText(
        "Turn on two-step verification in Profile & security to deactivate staff.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Profile & security" }),
    ).toHaveAttribute("href", "/account");
    expect(within(dialog).queryByLabelText("Digit 1 of 6")).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    ).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });

  it("an API answer of no two-step blocks it the same way", async () => {
    vi.spyOn(holder.client, "staffAction").mockRejectedValueOnce(
      new ApiError(403, "mfa_required"),
    );
    const { dialog } = await askDeactivate();
    await enterCode(dialog, MOCK_CODE);
    expect(
      await within(dialog).findByRole("link", { name: "Profile & security" }),
    ).toHaveAttribute("href", "/account");
    expect(within(dialog).queryByLabelText("Digit 1 of 6")).toBeNull();
  });

  it("deactivates with a backup code instead, and lowers your backup codes left", async () => {
    function Left() {
      const { user } = useAuth();
      return <p>Backup codes left: {user?.backupCodesLeft}</p>;
    }
    const action = vi.spyOn(holder.client, "staffAction");
    renderAdmin(
      <>
        <StaffPanel staffId="s-bello" onClose={onClose} />
        <Left />
      </>,
    );
    expect(screen.getByText("Backup codes left: 8")).toBeInTheDocument();
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    await userEvent.click(
      await within(panel).findByRole("button", { name: "Deactivate" }),
    );
    const dialog = confirmIn("Deactivate this account?");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Use a backup code" }),
    );
    await userEvent.type(
      within(dialog).getByLabelText("Backup code"),
      MOCK_BACKUP_CODES[1]!,
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Deactivate" }),
    );
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    expect(action.mock.calls[0]![2]).toEqual({
      backupCode: MOCK_BACKUP_CODES[1],
    });
    expect(await screen.findByText("Backup codes left: 7")).toBeInTheDocument();
  });

  it("explains why a hospital-account person has no password actions", async () => {
    const { account } = await open("s-okafor");
    expect(within(account).queryByText("Password reset")).toBeNull();
    expect(
      within(account).getByText(
        "Signs in with their hospital account. Their password and two-step are managed by the hospital.",
      ),
    ).toBeInTheDocument();
  });

  it("sends a password reset with your code and shows the demo's link once, then forgets it", async () => {
    let qc!: QueryClient;
    function Probe() {
      qc = useQueryClient();
      return null;
    }
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const send = vi.spyOn(holder.client, "sendLink");
    renderAdmin(
      <>
        <StaffPanel staffId="s-bello" onClose={onClose} />
        <Probe />
      </>,
    );
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    await userEvent.click(
      await within(panel).findByRole("button", { name: "Send password reset" }),
    );
    const dialog = confirmIn("Send a password reset?");
    expect(
      within(dialog).getByText(/valid for 30 minutes/),
    ).toBeInTheDocument();
    await enterCode(dialog, MOCK_CODE);
    const shared = await screen.findByRole("dialog", {
      name: "Reset link ready",
    });
    expect(send).toHaveBeenCalledWith(
      "s-bello",
      "password-reset",
      { mfaCode: MOCK_CODE },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    // A relative link is shown and copied as a full address.
    const link = within(shared).getByText(/\/reset-password\?token=demo$/);
    expect(link.textContent).toMatch(/^https?:\/\//);
    expect(within(shared).getByText(/shown only now/)).toBeInTheDocument();
    await userEvent.click(
      within(shared).getByRole("button", {
        name: "Copy the link for t.bello@havanahospital.org",
      }),
    );
    expect(writeText).toHaveBeenCalledWith(link.textContent);
    expect(await within(shared).findByText("Copied")).toBeInTheDocument();
    // Never in the caches, the address or storage.
    const cached = () =>
      JSON.stringify([
        qc
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
        qc
          .getMutationCache()
          .getAll()
          .map((m) => m.state.data),
      ]);
    await waitFor(() => expect(cached()).not.toMatch(/token=/));
    expect(window.location.href).not.toMatch(/token=/);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toMatch(
      /token=/,
    );
    await userEvent.click(within(shared).getByRole("button", { name: "Done" }));
    expect(screen.queryByText(/token=demo/)).toBeNull();
  });

  it("says the reset link was sent when core emails it (no link back)", async () => {
    const real = holder.client.sendLink.bind(holder.client);
    vi.spyOn(holder.client, "sendLink").mockImplementation(async (...a) => ({
      ...(await real(...a)),
      link: null,
    }));
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Send password reset" }),
    );
    await enterCode(confirmIn("Send a password reset?"), MOCK_CODE);
    expect(await screen.findByText("Reset link sent")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Reset link ready" }),
    ).toBeNull();
  });

  it.each([
    [new ApiError(503, "no_delivery"), "MHAI can't send emails yet"],
    [new ApiError(501, "not_implemented"), "Not available yet"],
    [new ApiError(429, "rate_limited"), "Too many tries for this person"],
  ])("says plainly when a reset can't be sent (%s)", async (err, title) => {
    vi.spyOn(holder.client, "sendLink").mockRejectedValue(err);
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Send password reset" }),
    );
    const dialog = confirmIn("Send a password reset?");
    await enterCode(dialog, MOCK_CODE);
    expect(await within(dialog).findByText(title)).toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(
      /no_delivery|not_implemented|503|501/,
    );
  });

  it("resets two-step with your code; they then need to set it up", async () => {
    const { account, panel } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Reset two-step" }),
    );
    await enterCode(confirmIn("Reset two-step verification?"), MOCK_CODE);
    expect(await screen.findByText("Two-step reset")).toBeInTheDocument();
    expect(
      await within(panel).findByText("Two-step not set up"),
    ).toBeInTheDocument();
    // Nothing to reset now: a reminder instead.
    expect(
      within(account).queryByRole("button", { name: "Reset two-step" }),
    ).toBeNull();
  });

  it("sends a two-step reminder without a code, once a day", async () => {
    const remind = vi.spyOn(holder.client, "remindStaff");
    const { account } = await open("s-mensah");
    const button = within(account).getByRole("button", {
      name: "Send a reminder",
    });
    await userEvent.click(button);
    expect(await screen.findByText("Reminder sent")).toBeInTheDocument();
    expect(remind).toHaveBeenCalledWith(
      "s-mensah",
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(
      await within(account).findByText("A reminder was already sent today"),
    ).toBeInTheDocument();
  });

  it("removes someone for good with your code and closes the panel", async () => {
    const remove = vi.spyOn(holder.client, "removeStaff");
    const { account } = await open("s-bello");
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = confirmIn("Remove this account?");
    expect(
      within(dialog).getByRole("button", { name: "Keep account" }),
    ).toHaveFocus();
    await enterCode(dialog, MOCK_CODE);
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(
      "s-bello",
      { mfaCode: MOCK_CODE },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(await statusOf("s-bello")).toBeUndefined();
  });

  it("never offers to remove or reset your own account, and says why", async () => {
    const { account } = await open("s-obi");
    const remove = within(account).getByRole("button", { name: "Remove" });
    expect(remove).toBeDisabled();
    expect(
      within(account).getByText(/You can't remove your own account/),
    ).toBeInTheDocument();
  });

  it("an invited person gets a new invite or has it cancelled", async () => {
    const r = await holder.client.inviteStaff(
      { emails: ["new.person@havanahospital.org"], roles: ["clinician"] },
      CODE,
    );
    const id = r.invited[0]!.staff.id;
    const { account, panel } = await open(id);
    expect(within(panel).getByText("Invited")).toBeInTheDocument();
    expect(
      within(panel).getByText("Invite expires in 7 days"),
    ).toBeInTheDocument();
    expect(
      within(account).queryByRole("button", { name: "Send password reset" }),
    ).toBeNull();
    await userEvent.click(
      within(account).getByRole("button", { name: "Send a new invite" }),
    );
    await enterCode(confirmIn("Send a new invite?"), MOCK_CODE);
    const shared = await screen.findByRole("dialog", {
      name: "New invite ready",
    });
    await userEvent.click(within(shared).getByRole("button", { name: "Done" }));
    await userEvent.click(
      within(account).getByRole("button", { name: "Cancel invite" }),
    );
    await enterCode(confirmIn("Cancel this invite?"), MOCK_CODE);
    expect(await screen.findByText("Invite cancelled")).toBeInTheDocument();
    expect(await statusOf(id)).toBeUndefined();
  });

  it("Esc closes the confirmation first, then the panel", async () => {
    const { dialog } = await askDeactivate();
    // jsdom has no top layer; say what a browser would for showModal().
    (dialog as HTMLDialogElement).matches = (q: string) => q === ":modal";
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

  it("while it is in flight, Keep is off and Esc is ignored; the toast still shows", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const real = holder.client.staffAction.bind(holder.client);
    vi.spyOn(holder.client, "staffAction").mockImplementation(async (...a) => {
      await gate;
      return real(...a);
    });
    const { dialog } = await askDeactivate();
    const d = dialog as HTMLDialogElement;
    const matches = d.matches.bind(d);
    d.matches = (q: string) => q === ":modal" || matches(q);
    await enterCode(dialog, MOCK_CODE);
    const keep = within(dialog).getByRole("button", { name: "Keep account" });
    await waitFor(() => expect(keep).toBeDisabled());
    await userEvent.keyboard("{Escape}");
    expect(confirmIn("Deactivate this account?")).toBeInTheDocument();
    await act(async () => release());
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
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
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    let dialog = confirmIn("Deactivate this account?");
    await enterCode(dialog, "000000");
    await within(dialog).findByText("That code didn't work. Try again.");
    await waitFor(() => expect(withCode()).toEqual([]));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Keep account" }),
    );
    // A right code.
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    dialog = confirmIn("Deactivate this account?");
    await enterCode(dialog, MOCK_CODE);
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    await waitFor(() => expect(withCode()).toEqual([]));
  });

  it("the sixth digit and a quick click send one request", async () => {
    const action = vi.spyOn(holder.client, "staffAction");
    const { dialog } = await askDeactivate();
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("12345");
    const confirm = within(dialog).getByRole("button", { name: "Deactivate" });
    act(() => {
      fireEvent.change(within(dialog).getByLabelText("Digit 6 of 6"), {
        target: { value: "6" },
      });
    });
    fireEvent.click(confirm);
    expect(await screen.findByText("Account deactivated")).toBeInTheDocument();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("Esc and open again: the code boxes are empty", async () => {
    const { dialog, account } = await askDeactivate();
    const d = dialog as HTMLDialogElement;
    d.matches = (q: string) => q === ":modal";
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123");
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Deactivate this account?" }),
      ).toBeNull(),
    );
    await userEvent.click(
      within(account).getByRole("button", { name: "Deactivate" }),
    );
    const again = confirmIn("Deactivate this account?");
    for (let i = 1; i <= 6; i++)
      expect(within(again).getByLabelText(`Digit ${i} of 6`)).toHaveValue("");
  });
});
