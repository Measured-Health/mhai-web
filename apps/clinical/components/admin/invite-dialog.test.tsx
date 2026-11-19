import { screen, waitFor, within } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS, MOCK_CODE } from "@/lib/auth/mock";
import { makeStaff, screenAdminAs } from "@/tests/admin";
import { enterCode, renderAdmin } from "@/tests/admin-render";

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

async function openDialog(probe?: (qc: QueryClient) => void) {
  function Probe() {
    const qc = useQueryClient();
    probe?.(qc);
    return null;
  }
  renderAdmin(
    <>
      <InviteDialog onClose={onClose} />
      <Probe />
    </>,
  );
  const dialog = await screen.findByRole("dialog", { name: "Invite staff" });
  await within(dialog).findByText(/email invite that expires in 7 days/);
  return dialog;
}
async function paste(dialog: HTMLElement, text: string) {
  await userEvent.click(within(dialog).getByLabelText("Work emails"));
  await userEvent.paste(text);
}
/** Continue, then the code: the sixth digit sends. */
async function sendWithCode(dialog: HTMLElement, title: string) {
  await userEvent.click(
    within(dialog).getByRole("button", { name: "Continue" }),
  );
  const confirm = await screen.findByRole("dialog", { name: title });
  await enterCode(confirm, MOCK_CODE);
  return confirm;
}
/** Live core in production: an email goes out, no link comes back. */
function noLinks() {
  const real = holder.client.inviteStaff.bind(holder.client);
  return vi
    .spyOn(holder.client, "inviteStaff")
    .mockImplementation(async (...a) => {
      const r = await real(...a);
      return { ...r, invited: r.invited.map((i) => ({ ...i, link: null })) };
    });
}

describe("InviteDialog (core 1.33.0)", () => {
  it("starts in the email box, with Cancel first", async () => {
    const dialog = await openDialog();
    expect(within(dialog).getByLabelText("Work emails")).toHaveFocus();
    expect(within(dialog).getAllByRole("button")[0]).toHaveTextContent(
      "Cancel",
    );
    expect(
      within(dialog).queryByRole("checkbox", { name: "Analyst" }),
    ).toBeNull();
  });

  it("shows each problem, and sends only the valid new people with your code", async () => {
    noLinks();
    const invite = vi.spyOn(holder.client, "inviteStaff");
    const dialog = await openDialog();
    await paste(
      dialog,
      "n.ade@havanahospital.org, N.ADE@havanahospital.org\nk.mensah@havanahospital.org; oops",
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
      "oops — Not an email address",
    ]);
    const confirm = await sendWithCode(dialog, "Send 1 invite?");
    expect(confirm).toBeTruthy();
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        {
          emails: ["n.ade@havanahospital.org"],
          roles: ["clinician"],
          specialty: null,
        },
        { mfaCode: MOCK_CODE },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Invite sent")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("sends the roles and specialty", async () => {
    noLinks();
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
    await sendWithCode(dialog, "Send 2 invites?");
    await waitFor(() =>
      expect(invite).toHaveBeenCalledWith(
        {
          emails: ["a.new@havanahospital.org", "b.new@havanahospital.org"],
          roles: ["clinician", "hospital_admin"],
          specialty: "Paediatrics",
        },
        { mfaCode: MOCK_CODE },
        expect.anything(),
      ),
    );
    expect(await screen.findByText("2 invites sent")).toBeInTheDocument();
  });

  it("needs a role", async () => {
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Clinician" }),
    );
    expect(within(dialog).getByText("Choose at least one role.")).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "Continue" }),
    ).toBeDisabled();
  });

  it("Back keeps what was typed", async () => {
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Continue" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Send 1 invite?",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Back" }),
    );
    const again = await screen.findByRole("dialog", { name: "Invite staff" });
    expect(within(again).getByLabelText("Work emails")).toHaveValue(
      "a.new@havanahospital.org",
    );
  });

  it("lists what the API skipped, in words", async () => {
    vi.spyOn(holder.client, "inviteStaff").mockResolvedValue({
      invited: [
        {
          staff: makeStaff({
            id: "s-x",
            email: "a.new@havanahospital.org",
            status: "invited",
          }),
          link: null,
        },
      ],
      skipped: [{ email: "b.new@havanahospital.org", reason: "already_staff" }],
    });
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org, b.new@havanahospital.org");
    await sendWithCode(dialog, "Send 2 invites?");
    const result = await screen.findByRole("dialog", { name: "Invites sent" });
    expect(within(result).getByText(/1 invite was sent/)).toBeInTheDocument();
    expect(
      within(result).getByText(
        "b.new@havanahospital.org — Already on the staff list",
      ),
    ).toBeInTheDocument();
    expect(
      within(result).queryByRole("list", { name: "Links to share" }),
    ).toBeNull();
  });

  it("shows the demo's links once, then forgets them", async () => {
    let qc!: QueryClient;
    const dialog = await openDialog((c) => (qc = c));
    await paste(dialog, "a.new@havanahospital.org, b.new@havanahospital.org");
    await sendWithCode(dialog, "Send 2 invites?");
    const result = await screen.findByRole("dialog", { name: "Invites sent" });
    const links = within(result).getByRole("list", { name: "Links to share" });
    expect(within(links).getAllByRole("listitem")).toHaveLength(2);
    expect(within(links).getByText("a.new@havanahospital.org")).toBeTruthy();
    expect(within(result).getByText(/shown only now/)).toBeInTheDocument();
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
    await userEvent.click(within(result).getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it.each([
    [new ApiError(503, "no_delivery"), "MHAI can't send emails yet"],
    [
      new ApiError(429, "rate_limited"),
      "Your hospital has sent all the invites it can today",
    ],
    [new ApiError(501, "not_implemented"), "Not available yet"],
    [new ApiError(403, "mfa_invalid"), "That code didn't work. Try again."],
  ])("says plainly when invites can't go (%s)", async (err, title) => {
    vi.spyOn(holder.client, "inviteStaff").mockRejectedValue(err);
    const dialog = await openDialog();
    await paste(dialog, "a.new@havanahospital.org");
    const confirm = await sendWithCode(dialog, "Send 1 invite?");
    expect(await within(confirm).findByText(title)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(confirm.textContent).not.toMatch(/no_delivery|rate_limited|503/);
  });
});
