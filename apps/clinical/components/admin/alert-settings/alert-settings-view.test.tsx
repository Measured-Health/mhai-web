import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import type { EmrClient, RecordsStatus } from "@/lib/api/emr-contract";
import { createMockEmr } from "@/lib/api/mock-emr";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { screenAdminAs } from "@/tests/admin";
import { renderAdmin, HOSPITAL_ADMIN } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({
  admin: null as unknown as AdminClient,
  emr: null as unknown as EmrClient,
}));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.admin }));
vi.mock("@/lib/api/emr", () => ({ getEmrClient: () => holder.emr }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/alerts",
}));
import { AlertSettingsView } from "./alert-settings-view";

const start = (connection?: RecordsStatus) => {
  holder.admin = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
  holder.emr = createMockEmr({
    me: async () => DEMO_EMAILS.hospitalAdmin,
    delayMs: 0,
    staff: () => holder.admin.listStaff(),
    ...(connection ? { connection } : {}),
  });
};
beforeEach(() => start());
afterEach(() => vi.restoreAllMocks());

const show = () => renderAdmin(<AlertSettingsView />, HOSPITAL_ADMIN);
const section = (name: string) => screen.getByRole("region", { name });
const ready = () => screen.findByRole("checkbox", { name: /Ward 3/ });

describe("AlertSettingsView", () => {
  it("shows Connected with Main record and Results system", async () => {
    show();
    await ready();
    const box = section("Patient records");
    expect(within(box).getByText("Connected")).toBeInTheDocument();
    expect(
      within(box).getByText(/^Main record · last update 2 min ago$/),
    ).toBeInTheDocument();
    expect(
      within(box).getByText(/^Results system · last update 1 min ago$/),
    ).toBeInTheDocument();
    expect(
      within(box).getByText(
        "Measured Health manages this connection. Contact them to change it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose which units MHAI watches, what it flags and who hears about it. Alerts go to clinicians only, never to patients.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Last changed by Grace Nwosu · /)).toBeVisible();
  });

  it("Not connected says Alerts start once Measured Health connects your records.", async () => {
    start("not_connected");
    show();
    await ready();
    const box = section("Patient records");
    expect(within(box).getByText("Not connected")).toBeInTheDocument();
    expect(
      within(box).getByText(
        "Alerts start once Measured Health connects your records. You can set them up now.",
      ),
    ).toBeInTheDocument();
  });

  it("words the other connection states", async () => {
    start("problems");
    const { unmount } = show();
    await ready();
    expect(screen.getByText("Connected, with problems")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Some updates may be late. Measured Health has been told.",
      ),
    ).toBeInTheDocument();
    unmount();
    start("off");
    show();
    await ready();
    expect(screen.getByText("Switched off")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Measured Health has paused this connection. No new alerts arrive until it's back.",
      ),
    ).toBeInTheDocument();
  });

  it("groups units, with the source beside each and a summary", async () => {
    show();
    await ready();
    const units = section("Units covered");
    expect(
      within(units).getByRole("group", { name: "Wards" }),
    ).toBeInTheDocument();
    expect(within(units).getByRole("group", { name: "Clinics" })).toBeVisible();
    expect(
      within(units).getByRole("group", { name: "Emergency" }),
    ).toBeVisible();
    expect(within(units).getByRole("group", { name: "Other" })).toBeVisible();
    expect(within(units).getByText("6 of 8 units covered")).toBeVisible();
    expect(
      within(units).getByRole("checkbox", { name: /Ward 3/ }),
    ).toBeChecked();
    expect(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    ).not.toBeChecked();
    expect(within(units).getAllByText("Main record").length).toBeGreaterThan(0);
    await userEvent.click(
      within(units).getByRole("button", { name: "Clear all" }),
    );
    expect(within(units).getByText("0 of 8 units covered")).toBeVisible();
    await userEvent.click(
      within(units).getByRole("button", { name: "Select all" }),
    );
    expect(within(units).getByText("8 of 8 units covered")).toBeVisible();
  });

  it("covering Ward 7 saves and toasts Alert settings saved.", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    show();
    await ready();
    const units = section("Units covered");
    expect(within(units).getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.click(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    );
    await userEvent.click(within(units).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]![0]).toMatchObject({
      version: 1,
      units: { covered: expect.arrayContaining(["u-ward-7"]) },
    });
    expect(Object.keys(update.mock.calls[0]![0]).sort()).toEqual([
      "units",
      "version",
    ]);
    expect(await screen.findByText("Alert settings saved.")).toBeVisible();
    // Focus moves to the status line.
    const status = within(units).getByRole("status");
    await waitFor(() => expect(status).toHaveFocus());
    expect(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    ).toBeChecked();
    expect(within(units).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("unchecking Ward 3 asks first and Keep covered is focused", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    show();
    await ready();
    const units = section("Units covered");
    await userEvent.click(
      within(units).getByRole("checkbox", { name: /Ward 3/ }),
    );
    await userEvent.click(within(units).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Patients in Ward 3 won't get alerts, including Critical ones.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Keep covered" }),
    ).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Keep covered" }),
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("says how many units when several are uncovered, then saves on confirm", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    show();
    await ready();
    const units = section("Units covered");
    await userEvent.click(
      within(units).getByRole("button", { name: "Clear all" }),
    );
    await userEvent.click(within(units).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "Patients in 6 units won't get alerts, including Critical ones.",
      ),
    ).toBeVisible();
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Stop/ }),
    );
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(await screen.findByText("Alert settings saved.")).toBeVisible();
  });

  it("setting Vital signs to Off asks first", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    show();
    await ready();
    const rules = section("What to flag");
    expect(
      within(rules).getByText(
        "Critical is the most serious. Info is for awareness only.",
      ),
    ).toBeVisible();
    const pick = within(rules).getByLabelText("Vital signs");
    expect(
      within(pick)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Off",
      "Critical only",
      "Critical and urgent",
      "All (including info)",
    ]);
    await userEvent.selectOptions(pick, "Off");
    await userEvent.click(within(rules).getByRole("button", { name: "Save" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(
        "MHAI won't flag any Vital signs results, including Critical ones.",
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Keep it on" }),
    ).toHaveFocus();
    expect(update).not.toHaveBeenCalled();
  });

  it("saves a lower level without asking", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    show();
    await ready();
    const rules = section("What to flag");
    await userEvent.selectOptions(
      within(rules).getByLabelText("Blood chemistry"),
      "Critical only",
    );
    await userEvent.click(within(rules).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Alert settings saved.")).toBeVisible();
    expect(update.mock.calls[0]![0]).toMatchObject({
      rules: { levels: { "blood-chemistry": "critical" } },
    });
  });

  it("Discard puts the section back and moves focus to the status line", async () => {
    show();
    await ready();
    const units = section("Units covered");
    await userEvent.click(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    );
    await userEvent.click(
      within(units).getByRole("button", { name: "Discard" }),
    );
    expect(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    ).not.toBeChecked();
    await waitFor(() =>
      expect(within(units).getByRole("status")).toHaveFocus(),
    );
  });

  it("a stale version shows Changed by someone else with Reload", async () => {
    show();
    await ready();
    await holder.emr.updateAlertSettings({
      version: 1,
      units: { covered: ["u-ward-3"] },
    });
    const units = section("Units covered");
    await userEvent.click(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    );
    await userEvent.click(within(units).getByRole("button", { name: "Save" }));
    expect(
      await within(units).findByText("Changed by someone else"),
    ).toBeVisible();
    await userEvent.click(
      within(units).getByRole("button", { name: "Reload" }),
    );
    await waitFor(() =>
      expect(within(units).queryByText("Changed by someone else")).toBeNull(),
    );
    expect(within(units).getByText("1 of 8 units covered")).toBeVisible();
  });

  it("never shows an address, a connection type or an error code", async () => {
    const { container } = show();
    await ready();
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/https?:|:\/\/|@|\bfhir\b|\bhl7\b|\bapi\b/i);
    expect(text).not.toMatch(/error|refused|timeout|\blab\b/i);
    for (const t of FORBIDDEN_TERMS) expect(text).not.toContain(t);
  });

  it("offline disables Save", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    show();
    await ready();
    const units = section("Units covered");
    await userEvent.click(
      within(units).getByRole("checkbox", { name: /Ward 7/ }),
    );
    expect(within(units).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(
      within(units).getByRole("button", { name: "Save" }),
    ).toHaveAccessibleDescription("You're offline. This needs a connection.");
  });

  it("says Couldn't load alert settings, with Try again", async () => {
    vi.spyOn(holder.emr, "getAlertSettings").mockRejectedValue(new Error("x"));
    show();
    expect(
      await screen.findByText(
        "Couldn't load alert settings",
        {},
        { timeout: 8000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  }, 10_000);
});
