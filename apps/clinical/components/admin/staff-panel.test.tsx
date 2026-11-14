import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
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
import { LAST_ADMIN, SELF_ADD } from "@/lib/admin/staff";
import { CODE, screenAdminAs } from "@/tests/admin";
import {
  DIRECTOR,
  HOSPITAL_ADMIN,
  enterCode,
  renderAdmin,
} from "@/tests/admin-render";

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

/** Save, then the step-up code: every staff write needs it (core 1.24.0). */
async function saveWithCode(panel: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(
    within(panel).getByRole("button", { name: "Save changes" }),
  );
  const dialog = await screen.findByRole("dialog", { name: /access\?$/ });
  await enterCode(dialog, code);
  return dialog;
}

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
    const dialog = await screen.findByRole("dialog", {
      name: "Save Dr. Mensah's access?",
    });
    expect(dialog).toHaveTextContent("Specialty: Internal Medicine.");
    expect(update).not.toHaveBeenCalled();
    await enterCode(dialog, "000000");
    expect(
      await within(dialog).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    await enterCode(dialog, MOCK_CODE);
    await waitFor(() =>
      expect(update).toHaveBeenLastCalledWith(
        "s-mensah",
        { version: 1, specialty: "Internal Medicine" },
        CODE,
        { idempotencyKey: expect.any(String) },
      ),
    );
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Save changes" }),
    ).toBeDisabled();
  });

  it("needs at least one role; reviewing follows the Clinician role, read-only", async () => {
    const panel = await open("s-okafor");
    expect(
      await within(panel).findByText("Reviews corrections in every specialty."),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("checkbox", { name: "Can review corrections" }),
    ).toBeNull();
    expect(
      within(panel).getByText(
        /Choosing who reviews which specialty: not available yet/,
      ),
    ).toBeInTheDocument();
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
    await holder.client.staffAction("s-nwosu", "deactivate", CODE);
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
    await holder.client.updateStaff(
      "s-bello",
      { version: 1, specialty: "Cardiology" },
      CODE,
    );
    await saveWithCode(panel);
    expect(
      await within(panel).findByText("Someone else changed this just now"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(within(panel).getByLabelText("Specialty")).toHaveValue(
        "Cardiology",
      ),
    );
  });

  it("says when the person is no longer on the list (Review Focus 2)", async () => {
    const panel = await open("s-bello");
    await userEvent.selectOptions(
      await within(panel).findByLabelText("Specialty"),
      "Surgery",
    );
    // Gone from this hospital meanwhile: core answers 404.
    vi.spyOn(holder.client, "updateStaff").mockRejectedValueOnce(
      new ApiError(404, "not_found"),
    );
    vi.spyOn(holder.client, "listStaff").mockResolvedValue(
      (await screenAdminAs(DEMO_EMAILS.director).listStaff()).filter(
        (x) => x.id !== "s-bello",
      ),
    );
    await saveWithCode(panel);
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

  it("lets you change your own specialty", async () => {
    const panel = await open("s-obi");
    const specialty = await within(panel).findByLabelText("Specialty");
    expect(specialty).toBeEnabled();
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

  it("never offers an admin a role for themselves, and says why (403 self_change)", async () => {
    holder.client = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
    renderAdmin(<StaffPanel staffId="s-nwosu" onClose={onClose} />, {
      ...HOSPITAL_ADMIN,
      features: { analysis: true },
    });
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    for (const name of ["Clinician"]) {
      const box = await within(panel).findByRole("checkbox", { name });
      expect(box).not.toBeChecked();
      expect(box).toBeDisabled();
      expect(box).toHaveAccessibleDescription(SELF_ADD);
    }
    expect(within(panel).getByText(SELF_ADD)).toBeInTheDocument();
    expect(
      within(panel).queryByText(/flagged for your hospital's admins/),
    ).toBeNull();
  });

  it("lets you remove your own Clinician role, with your code", async () => {
    const update = vi.spyOn(holder.client, "updateStaff");
    const panel = await open("s-obi");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Clinician" }),
    );
    const dialog = await saveWithCode(panel);
    expect(dialog).toHaveTextContent("It takes effect next time you sign in.");
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith(
      "s-obi",
      expect.objectContaining({ roles: ["hospital_admin"] }),
      CODE,
      expect.anything(),
    );
  });

  const withAnalysis = { ...DIRECTOR, features: { analysis: true } };
  const openWithAnalysis = async (id: string) => {
    renderAdmin(<StaffPanel staffId={id} onClose={onClose} />, withAnalysis);
    return screen.findByRole("dialog", { name: "Staff member" });
  };

  it("with Analysis off for the hospital, the Analyst box says why it's off", async () => {
    const off = await open("s-okafor");
    const analyst = await within(off).findByRole("checkbox", {
      name: "Analyst",
    });
    expect(analyst).toBeDisabled();
    expect(analyst).toHaveAccessibleDescription(
      /Analysis isn't switched on for your hospital\. Measured Health switches it on\./,
    );
  });

  it("someone deactivated or without two-step can't be given Analyst, and the box says why", async () => {
    const mensah = await openWithAnalysis("s-mensah");
    const box = await within(mensah).findByRole("checkbox", {
      name: "Analyst",
    });
    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription(
      /They need two-step verification turned on before they can be an analyst\./,
    );
    cleanup();
    const eze = await openWithAnalysis("s-eze");
    expect(
      await within(eze).findByRole("checkbox", { name: "Analyst" }),
    ).toHaveAccessibleDescription(/Reactivate them first/);
  });

  it("granting Analyst says what it gives in the confirmation, with your code", async () => {
    const panel = await openWithAnalysis("s-okafor");
    await userEvent.click(
      await within(panel).findByRole("checkbox", { name: "Analyst" }),
    );
    await userEvent.click(
      within(panel).getByRole("button", { name: "Save changes" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Save Dr. Okafor's access?",
    });
    expect(dialog).toHaveTextContent(
      "Dr. Okafor will see Analysis for this hospital: counts and de-identified patients.",
    );
    await enterCode(dialog, MOCK_CODE);
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
  });

  it.each([
    [
      "analyst_cap",
      { analystCap: 1 },
      "Your hospital has all the analysts it can have",
    ],
    [
      "analysis_off",
      { analysis: "off" as const },
      "Analysis isn't switched on for your hospital",
    ],
  ])(
    "a %s refusal is explained in the dialog, and nothing changes",
    async (_code, opts, title) => {
      holder.client = screenAdminAs(DEMO_EMAILS.director, opts);
      const panel = await openWithAnalysis("s-okafor");
      await userEvent.click(
        await within(panel).findByRole("checkbox", { name: "Analyst" }),
      );
      const dialog = await saveWithCode(panel);
      expect(await within(dialog).findByText(title)).toBeInTheDocument();
      expect(
        within(dialog).getByText(/Nothing was changed\./),
      ).toBeInTheDocument();
      expect(
        (await holder.client.listStaff()).find((x) => x.id === "s-okafor")!
          .roles,
      ).toEqual(["clinician"]);
    },
  );

  it.each([
    [422, "not_eligible", "Dr. Okafor can't be an analyst yet"],
    [403, "forbidden", "You can't change the Analyst role"],
  ])(
    "a %i %s answer from core is explained for this person",
    async (status, code, title) => {
      vi.spyOn(holder.client, "updateStaff").mockRejectedValueOnce(
        new ApiError(status, code),
      );
      const panel = await openWithAnalysis("s-okafor");
      await userEvent.click(
        await within(panel).findByRole("checkbox", { name: "Analyst" }),
      );
      const dialog = await saveWithCode(panel);
      expect(await within(dialog).findByText(title)).toBeInTheDocument();
    },
  );

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
    await saveWithCode(panel);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(
        "s-kemi",
        expect.objectContaining({ roles: ["hospital_admin"] }),
        CODE,
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
    await saveWithCode(panel);
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith(
      "s-okafor",
      expect.objectContaining({ roles: ["clinician", "analyst"] }),
      CODE,
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
    await saveWithCode(panel);
    expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    expect(
      await within(panel).findByText(
        /Dr. Obi removed Analyst access from Dr. Kemi Adeyemi/,
      ),
    ).toBeInTheDocument();
  });

  it("someone else's roles are all on offer", async () => {
    const panel = await open("s-okafor");
    const admin = await within(panel).findByRole("checkbox", {
      name: "Hospital admin",
    });
    expect(admin).toBeEnabled();
    expect(within(panel).queryByText(SELF_ADD)).toBeNull();
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
      // Only the step-up code is asked: no new confirmation (ruling 8).
      await saveWithCode(panel);
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
    });

    it("no warning when the person keeps a role a letter can cover", async () => {
      // Grace Nwosu (cl_act) becomes Clinician and Analyst, then drops Hospital admin.
      const panel = await openNamed("s-nwosu");
      await within(panel).findByText(/^Named access until/);
      await userEvent.click(
        within(panel).getByRole("checkbox", { name: "Clinician" }),
      );
      await userEvent.click(
        within(panel).getByRole("checkbox", { name: "Analyst" }),
      );
      await userEvent.click(
        within(panel).getByRole("checkbox", { name: "Hospital admin" }),
      );
      expect(
        within(panel).getByRole("button", { name: "Save changes" }),
      ).toBeEnabled();
      expect(within(panel).queryByText(ENDS_NAMED)).toBeNull();
      // Dropping Analyst as well leaves nothing a letter covers.
      await userEvent.click(
        within(panel).getByRole("checkbox", { name: "Analyst" }),
      );
      expect(within(panel).getByText(ENDS_NAMED)).toBeInTheDocument();
    });

    it("no warning when the person has no named access", async () => {
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

    it("after Deactivate the line reads No named access", async () => {
      const panel = await openNamed("s-nwosu");
      await within(panel).findByText(/^Named access until/);
      await userEvent.click(
        within(panel).getByRole("button", { name: "Deactivate" }),
      );
      const dialog = screen.getByRole("dialog", {
        name: "Deactivate this account?",
      });
      await enterCode(dialog, MOCK_CODE);
      expect(
        await within(panel).findByText("No named access"),
      ).toBeInTheDocument();
      expect(within(panel).queryByText(/^Named access until/)).toBeNull();
    });

    it("after losing both covering roles the line reads No named access", async () => {
      const panel = await openNamed("s-kemi");
      await within(panel).findByText(/^Named access until/);
      await userEvent.click(
        within(panel).getByRole("checkbox", { name: "Analyst" }),
      );
      await saveWithCode(panel);
      expect(await screen.findByText("Changes saved")).toBeInTheDocument();
      expect(
        await within(panel).findByText("No named access"),
      ).toBeInTheDocument();
    });

    it("with the switch Letters only the staff panel shows no named-access line", async () => {
      holder.clearances = sampleClients({
        admin: holder.client,
        namedAccess: "letters_only",
      }).clearances;
      const list = vi.spyOn(holder.clearances, "listClearances");
      const position = vi.spyOn(holder.clearances, "getNamedAccess");
      const panel = await openNamed("s-nwosu");
      await within(panel).findByText("Grace Nwosu", { selector: "b" });
      // The position has loaded (Letters only) before anything is asserted.
      await waitFor(() => expect(position).toHaveBeenCalled());
      await act(async () => {});
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

    it("says Couldn't load named access when the letters fail, and Try again brings the line back", async () => {
      vi.spyOn(holder.clearances, "listClearances").mockRejectedValueOnce(
        new ApiError(403, "forbidden"),
      );
      const panel = await openNamed("s-nwosu");
      expect(
        await within(panel).findByText("Couldn't load named access"),
      ).toBeInTheDocument();
      expect(within(panel).queryByText("No named access")).toBeNull();
      await userEvent.click(
        within(panel).getByRole("button", { name: "Try again" }),
      );
      expect(
        await within(panel).findByText(/^Named access until/),
      ).toBeInTheDocument();
      expect(
        within(panel).queryByText("Couldn't load named access"),
      ).toBeNull();
    });

    it("says Couldn't load named access when the switch's position fails", async () => {
      vi.spyOn(holder.clearances, "getNamedAccess").mockRejectedValueOnce(
        new ApiError(403, "forbidden"),
      );
      const panel = await openNamed("s-nwosu");
      expect(
        await within(panel).findByText("Couldn't load named access"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(panel).getByRole("button", { name: "Try again" }),
      );
      expect(
        await within(panel).findByText(/^Named access until/),
      ).toBeInTheDocument();
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
