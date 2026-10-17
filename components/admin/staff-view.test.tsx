import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";
import { HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/staff",
}));
import { StaffView } from "./staff-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const table = () =>
  screen.findByRole("table", { name: "Staff at the hospital" });
const names = (t: HTMLElement) =>
  within(t)
    .getAllByRole("button", { name: /^Manage / })
    .map((b) => b.getAttribute("aria-label")!.replace("Manage ", ""));

describe("StaffView", () => {
  it("lists everyone with roles, specialty, status, sign-in method and last active", async () => {
    renderAdmin(<StaffView />);
    expect(
      screen.getByRole("heading", { name: "Staff", level: 2 }),
    ).toBeInTheDocument();
    const t = await table();
    expect(names(t)).toHaveLength(13);
    expect(
      within(t)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual([
      "Name",
      "Roles",
      "Specialty",
      "Status",
      "Signs in with",
      "Last active",
      "Manage",
    ]);
    const mensah = within(t)
      .getByRole("button", { name: "Manage Dr. Kofi Mensah" })
      .closest("tr")!;
    expect(mensah).toHaveTextContent("k.mensah@havanahospital.org");
    expect(mensah).toHaveTextContent("Clinician");
    expect(mensah).toHaveTextContent("Cardiology");
    expect(mensah).toHaveTextContent("Two-step not set up");
    expect(mensah).toHaveTextContent("Password");
    expect(within(mensah).getByText("Never")).toHaveClass("sr-only");
    const obi = within(t)
      .getByRole("button", { name: "Manage Dr. Ngozi Obi" })
      .closest("tr")!;
    expect(obi).toHaveTextContent("(you)");
    expect(obi).toHaveTextContent("Hospital admin");
  });

  it("counts each filter and filters", async () => {
    renderAdmin(<StaffView />);
    await table();
    const group = screen.getByRole("group", { name: "Show" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "All · 13",
      "Active · 9",
      "Invited · 1",
      "Needs attention · 2",
      "Deactivated · 1",
    ]);
    await userEvent.click(
      within(group).getByRole("button", { name: "Needs attention · 2" }),
    );
    expect(names(await table())).toEqual([
      "Dr. Halima Sani",
      "Dr. Kofi Mensah",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("2 people shown");
  });

  it("searches name, email and specialty, ignoring accents and case", async () => {
    renderAdmin(<StaffView />);
    await table();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search staff" }),
      "PAED",
    );
    expect(names(await table())).toEqual([
      "Dr. Amaka Udo",
      "Dr. Funmi Adeyemi",
    ]);
  });

  it("says when nothing matches, and clears the search", async () => {
    renderAdmin(<StaffView />);
    await table();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search staff" }),
      "zzz",
    );
    expect(screen.getByText('No one matches "zzz".')).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(names(await table())).toHaveLength(13);
  });

  it("opens the panel from Manage and gives the focus back on close", async () => {
    renderAdmin(<StaffView />);
    const manage = within(await table()).getByRole("button", {
      name: "Manage Dr. Kofi Mensah",
    });
    await userEvent.click(manage);
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    expect(
      await within(panel).findByText("Dr. Kofi Mensah"),
    ).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Staff member" })).toBeNull();
    expect(manage).toHaveFocus();
  });

  it("invites someone, who appears as Invited", async () => {
    renderAdmin(<StaffView />);
    await table();
    await userEvent.click(screen.getByRole("button", { name: "Invite staff" }));
    const dialog = await screen.findByRole("dialog", { name: "Invite staff" });
    await userEvent.click(within(dialog).getByLabelText("Work emails"));
    await userEvent.paste("n.ade@havanahospital.org");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Send 1 invite" }),
    );
    const row = (
      await within(await table()).findByRole("button", {
        name: "Manage n.ade@havanahospital.org",
      })
    ).closest("tr")!;
    expect(row).toHaveTextContent("Invited");
  });

  it("shows cards instead of a table on a phone (R13)", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderAdmin(<StaffView />);
    const cards = await screen.findByRole("list", {
      name: "Staff at the hospital",
    });
    expect(screen.queryByRole("table")).toBeNull();
    const mensah = within(cards).getByRole("button", {
      name: "Manage Dr. Kofi Mensah",
    });
    expect(mensah).toHaveTextContent("Two-step not set up");
    expect(mensah).toHaveTextContent("Cardiology");
  });

  it("offers Try again when the list can't load", async () => {
    vi.spyOn(holder.client, "listStaff").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<StaffView />);
    expect(
      await screen.findByText("Couldn't load the staff list"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await table();
  });

  it("says admins never see consultations", async () => {
    renderAdmin(<StaffView />, HOSPITAL_ADMIN);
    await table();
    expect(
      screen.getByText(
        "Hospital admins manage people and settings for Havana Hospital only. They never see patients' consultations unless they're also a clinician.",
      ),
    ).toBeInTheDocument();
  });

  it("never cuts a long name", async () => {
    renderAdmin(<StaffView />);
    const t = await table();
    const name = within(t).getByText("Dr. Oluwaseun Adebayo-Ogunleye-Fashola");
    expect(name.className).not.toMatch(/truncate/);
    await waitFor(() =>
      expect(name.closest("[class*='overflow-wrap']")).not.toBeNull(),
    );
  });

  it("opens a row from the keyboard with Enter", async () => {
    renderAdmin(<StaffView />);
    const t = await table();
    const row = within(t)
      .getByRole("button", { name: "Manage Dr. Kofi Mensah" })
      .closest("tr")!;
    row.focus();
    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("dialog", { name: "Staff member" }),
    ).toBeInTheDocument();
  });

  it("keeps the list readable offline and says why Invite is off", async () => {
    renderAdmin(<StaffView />);
    await table();
    try {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });
      const invite = screen.getByRole("button", { name: "Invite staff" });
      expect(invite).toBeDisabled();
      expect(
        screen.getByText("You're offline. Reconnect to invite people."),
      ).toBeInTheDocument();
      expect(names(await table())).toHaveLength(13);
    } finally {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
    }
  });
});
