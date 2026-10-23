import { act, screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS, MOCK_CODE } from "@/lib/auth/mock";
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
    expect(names(t)).toHaveLength(14);
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

  it("the staff list shows an Analyst chip", async () => {
    renderAdmin(<StaffView />);
    const kemi = within(await table())
      .getByRole("button", { name: "Manage Dr. Kemi Adeyemi" })
      .closest("tr")!;
    expect(within(kemi).getByText("Analyst")).toBeInTheDocument();
    expect(within(kemi).getByText("Clinician")).toBeInTheDocument();
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
      "All · 14",
      "Active · 10",
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
    expect(names(await table())).toHaveLength(14);
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
    const card = mensah.closest("li")!;
    expect(card).toHaveTextContent("Two-step not set up");
    expect(card).toHaveTextContent("Cardiology");
    expect(card).toHaveTextContent("k.mensah@havanahospital.org");
    expect(mensah).toHaveTextContent("Manage");
    await userEvent.click(mensah);
    expect(
      await screen.findByRole("dialog", { name: "Staff member" }),
    ).toBeInTheDocument();
  });

  it("offers Try again when the list can't load", async () => {
    vi.spyOn(holder.client, "listStaff").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<StaffView />);
    expect(await screen.findByText("You can't do this")).toBeInTheDocument();
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
      expect(names(await table())).toHaveLength(14);
    } finally {
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });
    }
  });

  it("exposes the status word on a phone card to screen readers", async () => {
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
    const items = within(cards).getAllByRole("listitem");
    expect(items).toHaveLength(14);
    expect(within(items[0]).getAllByRole("button")).toHaveLength(1);
    expect(within(cards).getByText("Two-step not set up")).toBeInTheDocument();
  });

  it("says so, not a skeleton, when first opened offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    onlineManager.setOnline(false);
    try {
      renderAdmin(<StaffView />);
      expect(
        await screen.findByText(
          "You're offline. Staff will load when you reconnect.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).toBeNull();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("hides search and chips on a failed first load, with plain wording", async () => {
    vi.spyOn(holder.client, "listStaff").mockRejectedValueOnce(
      new ApiError(403, "forbidden"),
    );
    renderAdmin(<StaffView />);
    await screen.findByText("Try again");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("group", { name: "Show" })).toBeNull();
  });

  it("keeps the rows when a refresh fails, with the banner above them", async () => {
    const spy = vi.spyOn(holder.client, "listStaff");
    renderAdmin(<StaffView />);
    await table();
    spy.mockRejectedValue(new ApiError(403, "forbidden"));
    try {
      act(() => onlineManager.setOnline(false));
      act(() => onlineManager.setOnline(true));
      expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
      expect(names(await table())).toHaveLength(14);
      expect(screen.getByRole("searchbox")).toBeInTheDocument();
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("returns focus to the row after a keyboard open and close", async () => {
    renderAdmin(<StaffView />);
    const t = await table();
    const manage = within(t).getByRole("button", {
      name: "Manage Dr. Kofi Mensah",
    });
    const row = manage.closest("tr")!;
    row.focus();
    await userEvent.keyboard("{Enter}");
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(manage).toHaveFocus();
  });

  it("after a removal, focus goes to the search field (the row is gone)", async () => {
    renderAdmin(<StaffView />);
    const t = await table();
    await userEvent.click(
      within(t).getByRole("button", { name: "Manage Dr. Tunde Bello" }),
    );
    const panel = await screen.findByRole("dialog", { name: "Staff member" });
    const account = await within(panel).findByRole("region", {
      name: "Account",
    });
    await userEvent.click(
      within(account).getByRole("button", { name: "Remove" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Remove this account?" });
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    expect(await screen.findByText("Account removed")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Staff member" })).toBeNull(),
    );
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });
});
