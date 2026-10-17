import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { makeStaff, screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { InviteDialog } from "./invite-dialog";

const onClose = vi.fn();
beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  onClose.mockReset();
});
afterEach(() => vi.restoreAllMocks());

async function openDialog() {
  renderAdmin(<InviteDialog onClose={onClose} />);
  const dialog = await screen.findByRole("dialog", { name: "Invite staff" });
  await within(dialog).findByText(/hospital account|email invite/);
  return dialog;
}
async function paste(dialog: HTMLElement, text: string) {
  await userEvent.click(within(dialog).getByLabelText("Work emails"));
  await userEvent.paste(text);
}

describe("InviteDialog", () => {
  it("says invitees just sign in when the hospital uses single sign-on", async () => {
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        "These people sign in with their hospital account, so no password is needed.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Work emails")).toHaveFocus();
    const buttons = within(dialog).getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("Cancel");
  });

  it("says the email invite lasts 7 days without hospital sign-on", async () => {
    const s = await holder.client.getSettings();
    vi.spyOn(holder.client, "getSettings").mockResolvedValue({
      ...s,
      sso: { status: "not_set_up", domain: null },
    });
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(
        "They'll get an email invite that expires in 7 days, then go through first sign-in.",
      ),
    ).toBeInTheDocument();
  });

  it("shows each problem and sends only the valid new people (Review Focus 3)", async () => {
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(
      dialog,
      "n.ade@havanahospital.org, N.ADE@havanahospital.org\nk.mensah@havanahospital.org\nsomeone@gmail.com; oops",
    );
    expect(within(dialog).getByText("1 person")).toBeInTheDocument();
    const problems = within(dialog).getByRole("list", { name: "Not invited" });
    expect(
      within(problems)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "n.ade@havanahospital.org — Listed twice",
      "k.mensah@havanahospital.org — Already on the staff list",
      "someone@gmail.com — Not a hospital email address",
      "oops — Not an email address",
    ]);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    );
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        {
          emails: ["n.ade@havanahospital.org"],
          roles: ["clinician"],
          specialty: null,
        },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Invite sent")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends the role and specialty with the invite", async () => {
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org\nb.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Hospital admin" }),
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Specialty"),
      "Paediatrics",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 2 invites" }),
    );
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        {
          emails: ["a.new@havanahospital.org", "b.new@havanahospital.org"],
          roles: ["clinician", "hospital_admin"],
          specialty: "Paediatrics",
        },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("2 invites sent")).toBeInTheDocument();
  });

  it("lists what the API skipped, in words (Review Focus 3)", async () => {
    vi.spyOn(holder.client, "inviteStaff").mockResolvedValue({
      invited: [
        makeStaff({
          id: "s-x",
          email: "a.new@havanahospital.org",
          status: "invited",
        }),
      ],
      skipped: [{ email: "b.new@havanahospital.org", reason: "already_staff" }],
    });
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org, b.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 2 invites" }),
    );
    const result = await screen.findByRole("dialog", { name: "Invites sent" });
    expect(
      within(result).getByText("1 invite was sent. These weren't sent:"),
    ).toBeInTheDocument();
    expect(
      within(result).getByText(
        "b.new@havanahospital.org — Already on the staff list",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.click(within(result).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("needs a role, and caps a send at 200", async () => {
    const dialog = await openDialog();
    await paste(
      dialog,
      Array.from({ length: 201 }, (_, i) => `p${i}@havanahospital.org`).join(
        "\n",
      ),
    );
    expect(
      within(dialog).getByText("Invite at most 200 people at a time."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send 201 invites" }),
    ).toBeDisabled();
    await userEvent.clear(within(dialog).getByLabelText("Work emails"));
    await paste(dialog, "p1@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Clinician" }),
    );
    expect(
      within(dialog).getByText("Choose at least one role."),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    ).toBeDisabled();
  });

  it("can't send offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    expect(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    ).toBeDisabled();
    expect(
      within(dialog).getByText("You're offline. Invites need a connection."),
    ).toBeInTheDocument();
  });

  it("Cancel closes without sending", async () => {
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(onClose).toHaveBeenCalled();
    expect(invite).not.toHaveBeenCalled();
  });

  it("moves focus into the results dialog when it replaces the form", async () => {
    vi.spyOn(holder.client, "inviteStaff").mockResolvedValue({
      invited: [],
      skipped: [{ email: "b.new@havanahospital.org", reason: "already_staff" }],
    });
    const dialog = await openDialog();
    await paste(dialog, "b.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    );
    const result = await screen.findByRole("dialog", {
      name: "No invites sent",
    });
    expect(
      within(result).getByText("No invites were sent. These weren't sent:"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(result).getByRole("button", { name: "Done" }),
      ).toHaveFocus(),
    );
  });

  it("counts only the valid new people against the 200 cap", async () => {
    const dialog = await openDialog();
    const list = Array.from(
      { length: 200 },
      (_, i) => `p${i}@havanahospital.org`,
    );
    await paste(dialog, [...list, "p0@havanahospital.org", "oops"].join("\n"));
    expect(
      within(dialog).queryByText("Invite at most 200 people at a time."),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Send 200 invites" }),
    ).toBeEnabled();
    expect(
      within(dialog).getByText("p0@havanahospital.org — Listed twice"),
    ).toBeInTheDocument();
  });

  it("wraps long addresses instead of cutting them off", async () => {
    const dialog = await openDialog();
    const long = `${"a".repeat(60)}@gmail.com`;
    await paste(dialog, long);
    const li = within(dialog).getByText(
      `${long} — Not a hospital email address`,
    );
    expect(li.closest("li")).toHaveClass("[overflow-wrap:anywhere]");
  });
});
