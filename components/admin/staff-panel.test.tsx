import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS, MOCK_CODE } from "@/lib/auth/mock";
import { LAST_ADMIN } from "@/lib/admin/staff";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

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

const open = async (id: string) => {
  renderAdmin(<StaffPanel staffId={id} onClose={onClose} />);
  return screen.findByRole("dialog", { name: "Staff member" });
};

describe("StaffPanel", () => {
  it("shows the person, the policy warning and recent activity", async () => {
    const panel = await open("s-mensah");
    expect(
      await within(panel).findByText("Dr. Kofi Mensah"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/k\.mensah@havanahospital\.org/),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Two-step not set up")).toBeInTheDocument();
    expect(
      await within(panel).findByText("Two-step verification isn't set up"),
    ).toBeInTheDocument();
    expect(
      await within(panel).findByText(
        /Changed Dr. Mensah's specialty to Cardiology · by Dr. Obi/,
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Every change is recorded in the activity log."),
    ).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Close" })).toHaveFocus();
  });

  it("changes the specialty and saves only that, with the version", async () => {
    const update = vi.spyOn(holder.client, "updateStaff");
    const panel = await open("s-mensah");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Internal Medicine",
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "s-mensah",
        { version: 1, specialty: "Internal Medicine" },
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  it("needs at least one role, and review rights need a specialty", async () => {
    const panel = await open("s-okafor");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Clinician" }),
    );
    expect(
      within(panel).getByText("Choose at least one role."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "Clinician" }),
    );
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "Infectious disease" }),
    );
    expect(
      within(panel).getByText(
        "Choose at least one specialty they can review in.",
      ),
    ).toBeInTheDocument();
  });

  it("your own admin role can't be unticked (Review Focus 1)", async () => {
    const panel = await open("s-obi");
    const admin = await within(panel).findByRole("checkbox", {
      name: "Hospital admin",
    });
    expect(admin).toBeChecked();
    expect(admin).toBeDisabled();
    expect(admin).toHaveAccessibleDescription(
      "You can't remove your own hospital admin role. Ask another hospital admin.",
    );
    expect(within(panel).getByText("(you)")).toBeInTheDocument();
  });

  it("the last admin keeps the role (Review Focus 4)", async () => {
    holder.client = screenAdminAs(null);
    await holder.client.staffAction("s-nwosu", "deactivate");
    const panel = await open("s-obi");
    const admin = await within(panel).findByRole("checkbox", {
      name: "Hospital admin",
    });
    expect(admin).toBeDisabled();
    expect(admin).toHaveAccessibleDescription(LAST_ADMIN);
  });

  it("shows the latest after a conflict (Review Focus 2)", async () => {
    const panel = await open("s-bello");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    // Another admin changes Dr. Bello first.
    await holder.client.updateStaff("s-bello", {
      version: 1,
      specialty: "Cardiology",
    });
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(panel).findByText("Someone else changed this just now"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(panel).getByLabelText("Specialty")).toHaveValue(
        "Cardiology",
      ),
    );
  });

  it("says when the person was removed elsewhere (Review Focus 2)", async () => {
    const panel = await open("s-bello");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    await holder.client.removeStaff(
      "s-bello",
      { mfaCode: MOCK_CODE },
      { idempotencyKey: "k-remove" },
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(panel).findByText(
        "This person is no longer on the staff list",
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Back to staff" }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("can't save offline, and says so", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const panel = await open("s-mensah");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
    expect(
      within(panel).getByText("You're offline. Changes need a connection."),
    ).toBeInTheDocument();
  });

  it("lets you change your own specialty and review rights", async () => {
    const panel = await open("s-obi");
    const specialty = await within(panel).findByLabelText("Specialty");
    expect(specialty).toBeEnabled();
    expect(
      within(panel).getByRole("checkbox", { name: "Can review corrections" }),
    ).toBeEnabled();
  });

  it("closes with Esc", async () => {
    await open("s-mensah");
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("wraps a very long name instead of cutting it", async () => {
    const panel = await open("s-long");
    const name = await within(panel).findByText(
      "Dr. Oluwaseun Adebayo-Ogunleye-Fashola",
    );
    expect(name.closest("[class*='overflow-wrap']")).not.toBeNull();
    expect(name.className).not.toMatch(/truncate/);
  });
});
