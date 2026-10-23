import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dayLabel } from "@mhai/ui/clearances";
import type { AdminClient } from "@/lib/api/admin";
import type { ClearanceClient } from "@/lib/api/clearances";
import { resetClearances } from "@/lib/api/mock-clearances";
import { ENDS_NAMED } from "@/lib/clearances/summary";
import { dayAfter, sampleClients } from "@/tests/clearances";
import { DEMO_EMAILS, MOCK_CODE } from "@/lib/auth/mock";
import { ApiError } from "@/lib/api/errors";
import { LAST_ADMIN } from "@/lib/admin/staff";
import { screenAdminAs } from "@/tests/admin";
import { DIRECTOR, HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({
  client: null as unknown as AdminClient,
  clearances: null as unknown as ClearanceClient,
}));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("@/lib/api/clearances", () => ({
  getClearanceClient: () => holder.clearances,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { StaffPanel } from "./staff-panel";

const onClose = vi.fn();
beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  resetClearances();
  holder.clearances = sampleClients({ admin: holder.client }).clearances;
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

  it("lets an admin give themselves a role, saying it is recorded (product decision)", async () => {
    holder.client = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
    const update = vi.spyOn(holder.client, "updateStaff");
    renderAdmin(
      <StaffPanel staffId="s-nwosu" onClose={onClose} />,
      HOSPITAL_ADMIN,
    );
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    const notice =
      "This change is recorded in the activity log and flagged for your hospital's admins. It takes effect next time you sign in.";
    const clinician = await within(panel).findByRole("checkbox", {
      name: "Clinician",
    });
    expect(within(panel).queryByText(notice)).toBeNull();
    await userEvent.click(clinician);
    expect(within(panel).getByText(notice)).toBeInTheDocument();
    const save = within(panel).getByRole("button", { name: "Save changes" });
    expect(save).toHaveAccessibleDescription(notice);
    await userEvent.click(save);
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith(
      "s-nwosu",
      expect.objectContaining({ roles: ["clinician", "hospital_admin"] }),
      expect.anything(),
    );
    expect(
      await within(panel).findByText(
        /Gave themselves the Clinician role · by Grace Nwosu/,
      ),
    ).toBeInTheDocument();
  });

  const withAnalysis = { ...DIRECTOR, features: { analysis: true } };
  const openWithAnalysis = async (id: string) => {
    renderAdmin(<StaffPanel staffId={id} onClose={onClose} />, withAnalysis);
    return screen.findByRole("dialog", { name: "Staff member" });
  };

  it("the Analyst box shows only with the feature on", async () => {
    const off = await open("s-okafor");
    await within(off).findByRole("checkbox", { name: "Clinician" });
    expect(within(off).queryByRole("checkbox", { name: "Analyst" })).toBeNull();
  });

  it("Analyst is disabled without Clinician and dropped from the patch when Clinician is unticked", async () => {
    const update = vi.spyOn(holder.client, "updateStaff");
    const panel = await openWithAnalysis("s-kemi");
    const analyst = await within(panel).findByRole("checkbox", {
      name: "Analyst",
    });
    expect(analyst).toBeChecked();
    expect(analyst).toHaveAccessibleDescription(
      /Sees Analysis for this hospital: counts and de-identified patients\./,
    );
    // Someone with only Hospital admin: Analyst is off and disabled.
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "Hospital admin" }),
    );
    await userEvent.click(
      within(panel).getByRole("checkbox", { name: "Clinician" }),
    );
    expect(analyst).toBeDisabled();
    expect(analyst).not.toBeChecked();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "s-kemi",
        expect.objectContaining({ roles: ["hospital_admin"] }),
        expect.anything(),
      ),
    );
  });

  it("unticking Clinician on Clinician + Analyst alone needs a role", async () => {
    const panel = await openWithAnalysis("s-kemi");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Clinician" }),
    );
    expect(
      within(panel).getByText("Choose at least one role."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  it("granting Analyst saves and logs 'gave Kemi Adeyemi Analyst access'", async () => {
    const update = vi.spyOn(holder.client, "updateStaff");
    const panel = await openWithAnalysis("s-okafor");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Analyst" }),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith(
      "s-okafor",
      expect.objectContaining({ roles: ["clinician", "analyst"] }),
      expect.anything(),
    );
    expect(
      await within(panel).findByText(/Dr. Obi gave Dr. Okafor Analyst access/),
    ).toBeInTheDocument();
  });

  it("removing logs 'removed Analyst access'", async () => {
    const panel = await openWithAnalysis("s-kemi");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Analyst" }),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(
      await within(panel).findByText(
        /Dr. Obi removed Analyst access from Dr. Kemi Adeyemi/,
      ),
    ).toBeInTheDocument();
  });

  it("no notice for someone else's roles", async () => {
    const panel = await open("s-okafor");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Hospital admin" }),
    );
    expect(
      within(panel).queryByText(/This change is recorded in the activity log/),
    ).toBeNull();
  });

  it("offers Try again, not an endless skeleton, when the list can't load", async () => {
    const list = vi
      .spyOn(holder.client, "listStaff")
      .mockRejectedValueOnce(new ApiError(403, "forbidden"));
    const panel = await open("s-mensah");
    expect(
      await within(panel).findByText("You can't do this"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole("button", { name: "Try again" }),
    );
    expect(
      await within(panel).findByText("Dr. Kofi Mensah"),
    ).toBeInTheDocument();
    expect(list).toHaveBeenCalledTimes(2);
  });

  describe("named access (Plan 11)", () => {
    const named = {
      ...DIRECTOR,
      features: { analysis: true, named: true },
    };
    const openNamed = async (id: string) => {
      renderAdmin(<StaffPanel staffId={id} onClose={onClose} />, named);
      return screen.findByRole("dialog", { name: "Staff member" });
    };
    const today = async () => (await holder.clearances.listClearances()).today;

    it("the staff panel shows Named access until … for Grace Nwosu and No named access for a clinician", async () => {
      const t = await today();
      const grace = await openNamed("s-nwosu");
      expect(
        await within(grace).findByText(
          `Named access until ${dayLabel(dayAfter(t, 137))} · letter on file`,
        ),
      ).toBeInTheDocument();
      cleanup();
      const bello = await openNamed("s-bello");
      expect(
        await within(bello).findByText("No named access"),
      ).toBeInTheDocument();
      expect(within(bello).queryByText(/Named access until/)).toBeNull();
    });

    it("removing Kemi Adeyemi's Analyst role says it also ends their named access", async () => {
      const panel = await openNamed("s-kemi");
      await within(panel).findByText(/^Named access until/);
      expect(within(panel).queryByText(ENDS_NAMED)).toBeNull();
      await userEvent.click(
        await within(panel).findByRole("checkbox", { name: "Analyst" }),
      );
      const warning = within(panel).getByText(ENDS_NAMED);
      const save = within(panel).getByRole("button", { name: "Save changes" });
      expect(save).toHaveAccessibleDescription(ENDS_NAMED);
      // A warning line above Save, not a new confirmation (ruling 8).
      expect(
        warning.compareDocumentPosition(save) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      await userEvent.click(save);
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: /\?$/ })).toBeNull();
    });

    it("no warning when the person keeps a role a letter can cover, or has no named access", async () => {
      // Dr. Okafor has no letter: giving and taking roles says nothing.
      const panel = await openNamed("s-okafor");
      await within(panel).findByText("No named access");
      await userEvent.click(
        within(panel).getByRole("checkbox", { name: "Hospital admin" }),
      );
      expect(within(panel).queryByText(ENDS_NAMED)).toBeNull();
    });

    it("deactivating someone with named access says it also ends it", async () => {
      const panel = await openNamed("s-nwosu");
      await within(panel).findByText(/^Named access until/);
      await userEvent.click(
        within(panel).getByRole("button", { name: "Deactivate" }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Deactivate this account?",
      });
      expect(dialog).toHaveTextContent(ENDS_NAMED);
    });

    it("resetting two-step for someone with named access says it also ends it", async () => {
      // Dr. Bello signs in with a password; say an active letter covers him.
      const list = holder.clearances.listClearances.bind(holder.clearances);
      vi.spyOn(holder.clearances, "listClearances").mockImplementation(
        async () => {
          const d = await list();
          return {
            ...d,
            clearances: d.clearances.map((c) =>
              c.id === "cl_act"
                ? {
                    ...c,
                    covered: [
                      ...c.covered,
                      { id: "s-bello", display_name: "Dr. Bello" },
                    ],
                  }
                : c,
            ),
          };
        },
      );
      const panel = await openNamed("s-bello");
      await within(panel).findByText(/^Named access until/);
      await userEvent.click(
        within(panel).getByRole("button", { name: "Reset two-step" }),
      );
      expect(
        screen.getByRole("dialog", { name: "Reset two-step verification?" }),
      ).toHaveTextContent(ENDS_NAMED);
    });

    it("no sentence on the confirms for someone without named access", async () => {
      const panel = await openNamed("s-bello");
      await within(panel).findByText("No named access");
      await userEvent.click(
        within(panel).getByRole("button", { name: "Reset two-step" }),
      );
      expect(
        screen.getByRole("dialog", { name: "Reset two-step verification?" }),
      ).not.toHaveTextContent(ENDS_NAMED);
    });

    it("with the switch Letters only the staff panel shows no named-access line", async () => {
      holder.clearances = sampleClients({
        admin: holder.client,
        namedAccess: "letters_only",
      }).clearances;
      const list = vi.spyOn(holder.clearances, "listClearances");
      const panel = await openNamed("s-nwosu");
      await within(panel).findByText("Grace Nwosu", { selector: "b" });
      await waitFor(() =>
        expect(
          within(panel).getByRole("button", { name: "Deactivate" }),
        ).toBeInTheDocument(),
      );
      expect(within(panel).queryByText(/Named access until/)).toBeNull();
      expect(within(panel).queryByText("No named access")).toBeNull();
      expect(list).not.toHaveBeenCalled();
      await userEvent.click(
        within(panel).getByRole("button", { name: "Deactivate" }),
      );
      expect(
        screen.getByRole("dialog", { name: "Deactivate this account?" }),
      ).not.toHaveTextContent(ENDS_NAMED);
    });

    it("without named access on the account, nothing is asked of the letters", async () => {
      const position = vi.spyOn(holder.clearances, "getNamedAccess");
      const panel = await open("s-nwosu");
      await within(panel).findByRole("button", { name: "Deactivate" });
      expect(within(panel).queryByText("No named access")).toBeNull();
      expect(position).not.toHaveBeenCalled();
    });
  });
});
