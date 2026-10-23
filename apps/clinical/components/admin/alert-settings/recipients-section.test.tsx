import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import type { EmrClient } from "@/lib/api/emr-contract";
import { createMockEmr } from "@/lib/api/mock-emr";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
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

beforeEach(() => {
  holder.admin = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
  holder.emr = createMockEmr({
    me: async () => DEMO_EMAILS.hospitalAdmin,
    delayMs: 0,
    staff: () => holder.admin.listStaff(),
  });
});
afterEach(() => vi.restoreAllMocks());

const NEITHER = "Choose the hospital queue, at least one clinician, or both.";
const open = async () => {
  renderAdmin(<AlertSettingsView />, HOSPITAL_ADMIN);
  await screen.findByRole("switch", { name: "Hospital queue" });
  const box = screen.getByRole("region", { name: "Who gets alerts" });
  // The staff list is what the combobox offers.
  await waitFor(() => expect(within(box).getByRole("combobox")).toBeEnabled());
  return box;
};
const names = (box: HTMLElement) =>
  within(box)
    .getAllByRole("button", { name: /^Remove / })
    .map((b) => b.getAttribute("aria-label"));

describe("RecipientsSection", () => {
  it("shows the queue, the named clinicians and what they get", async () => {
    const box = await open();
    expect(
      within(box).getByRole("switch", { name: "Hospital queue" }),
    ).toBeChecked();
    expect(
      within(box).getByText(
        "A shared list every clinician at the hospital can see and act on.",
      ),
    ).toBeVisible();
    expect(
      within(box).getByText(
        "Named clinicians get alerts as For you, with pop-ups.",
      ),
    ).toBeVisible();
    expect(names(box)).toEqual(["Remove Dr. Reyes", "Remove Dr. Mensah"]);
  });

  it("Save is disabled with no queue and nobody named", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    const box = await open();
    await userEvent.click(
      within(box).getByRole("switch", { name: "Hospital queue" }),
    );
    await userEvent.click(
      within(box).getByRole("button", { name: "Remove Dr. Reyes" }),
    );
    await userEvent.click(
      within(box).getByRole("button", { name: "Remove Dr. Mensah" }),
    );
    expect(within(box).getByText(NEITHER)).toBeVisible();
    const save = within(box).getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription(NEITHER);
    expect(update).not.toHaveBeenCalled();
    // The queue alone is enough.
    await userEvent.click(
      within(box).getByRole("switch", { name: "Hospital queue" }),
    );
    expect(within(box).queryByText(NEITHER)).toBeNull();
    expect(save).toBeEnabled();
  });

  it("shows the same words for a refused save (422 no_recipients)", async () => {
    vi.spyOn(holder.emr, "updateAlertSettings").mockRejectedValue(
      new ApiError(422, "no_recipients"),
    );
    const box = await open();
    await userEvent.click(
      within(box).getByRole("button", { name: "Remove Dr. Reyes" }),
    );
    await userEvent.click(within(box).getByRole("button", { name: "Save" }));
    expect(await within(box).findByText(NEITHER)).toBeVisible();
  });

  it("adds Dr. Adeyemi from Staff", async () => {
    const update = vi.spyOn(holder.emr, "updateAlertSettings");
    const box = await open();
    const combo = within(box).getByRole("combobox", { name: "Add clinician" });
    await userEvent.type(combo, "adeyemi");
    await userEvent.click(
      await screen.findByRole("option", { name: /Dr\. Kemi Adeyemi/ }),
    );
    expect(names(box)).toContain("Remove Dr. Kemi Adeyemi");
    await userEvent.click(within(box).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0]![0]).toMatchObject({
      recipients: {
        queue: true,
        clinician_ids: ["s-reyes", "s-mensah", "s-kemi"],
      },
    });
    expect(await screen.findByText("Alert settings saved.")).toBeVisible();
  });

  it("only active clinicians are offered", async () => {
    const box = await open();
    const combo = within(box).getByRole("combobox", { name: "Add clinician" });
    await userEvent.click(combo);
    await userEvent.keyboard("{ArrowDown}");
    const offered = (await screen.findAllByRole("option")).map(
      (o) => o.textContent ?? "",
    );
    const staff = await holder.admin.listStaff();
    const bad = staff.filter(
      (s) => s.status !== "active" || !s.roles.includes("clinician"),
    );
    expect(bad.length).toBeGreaterThan(0);
    for (const s of bad)
      expect(offered.some((t) => t.includes(s.display_name))).toBe(false);
    // Not already named, and the specialty is shown.
    expect(offered.some((t) => t.includes("Dr. Reyes"))).toBe(false);
    expect(offered.some((t) => t.includes("Internal Medicine"))).toBe(true);
  });

  it("removes a named clinician with the keyboard", async () => {
    const box = await open();
    await userEvent.click(
      within(box).getByRole("button", { name: "Remove Dr. Mensah" }),
    );
    expect(names(box)).toEqual(["Remove Dr. Reyes"]);
    expect(within(box).getByRole("button", { name: "Discard" })).toBeEnabled();
  });
});
