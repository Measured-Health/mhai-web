import { act, screen, waitFor, within } from "@testing-library/react";
import { onlineManager } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { ApiError } from "@/lib/api/errors";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { makeEvent, screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/activity",
}));
const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/csv", async (original) => ({
  ...(await original<typeof import("@/lib/admin/csv")>()),
  downloadCsv: download,
}));
import { ActivityView } from "./activity-view";

beforeEach(() => {
  holder.client = screenAdminAs(DEMO_EMAILS.director);
  download.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onlineManager.setOnline(true);
});

const log = () =>
  screen.findByRole("table", { name: "Activity at the hospital" });
const rows = (t: HTMLElement) => within(t).getAllByRole("row").slice(1);
const rowWith = async (text: string) =>
  (await within(await log()).findByText(text)).closest("tr")!;

function goOffline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}
function goOnline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

describe("ActivityView", () => {
  it("lists what happened, newest first, consultations by specialty and confidence only", async () => {
    renderAdmin(<ActivityView />);
    const first = rows(await log())[0]!;
    expect(first).toHaveTextContent("Dr. Obi");
    expect(first).toHaveTextContent("Admin");
    expect(first).toHaveTextContent(
      "Changed Dr. Mensah's specialty to Cardiology",
    );
    expect(
      await rowWith(
        "Ran a consultation · Internal Medicine · Use with caution",
      ),
    ).toHaveTextContent("Consultation");
  });

  it("flags security and policy events with a word and an icon", async () => {
    renderAdmin(<ActivityView />);
    const alert = await rowWith(
      "5 failed sign-ins for Dr. Bello · account locked",
    );
    expect(alert).toHaveTextContent("Alert");
    expect(alert.querySelector("svg")).not.toBeNull();
    const policy = await rowWith(
      "Signed in without two-step (setup pending) · Chrome on Windows",
    );
    expect(policy).toHaveTextContent("Policy");
    expect(document.body.textContent).not.toMatch(/2-step/i);
  });

  it("flags an admin giving themselves a role, in plain words", async () => {
    holder.client = screenAdminAs(DEMO_EMAILS.hospitalAdmin);
    const me = (await holder.client.listStaff()).find((s) => s.is_you)!;
    await holder.client.updateStaff(me.id, {
      version: me.version,
      roles: ["clinician", "hospital_admin"],
    });
    renderAdmin(<ActivityView />);
    const row = await rowWith("Gave themselves the Clinician role");
    expect(row).toHaveTextContent("Grace Nwosu");
    expect(row).toHaveTextContent("Alert");
    expect(row.querySelector("svg")).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/self_role_change/);
  });

  it("filters by type and by flagged only", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Type"), "security");
    await waitFor(async () => expect(rows(await log())).toHaveLength(1));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "");
    await userEvent.click(screen.getByRole("button", { name: "Flagged only" }));
    await waitFor(async () => expect(rows(await log())).toHaveLength(2));
  });

  it("filters by person once typing stops", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filter by person" }),
      "okafor",
    );
    await waitFor(async () => {
      const r = rows(await log());
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) expect(row).toHaveTextContent("Dr. Okafor");
    });
  });

  it("loads older events by page", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Dates"), "12m");
    await waitFor(async () => expect(rows(await log())).toHaveLength(50));
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(async () => expect(rows(await log())).toHaveLength(100));
  });

  it("defaults to the last 7 days", async () => {
    renderAdmin(<ActivityView />);
    await log();
    expect(screen.getByLabelText("Dates")).toHaveValue("7d");
  });

  it("exports every page for the filters as a CSV built in memory", async () => {
    const list = vi.spyOn(holder.client, "listActivity");
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Dates"), "12m");
    await waitFor(async () => expect(rows(await log())).toHaveLength(50));
    const before = list.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    expect(list.mock.calls.length - before).toBe(3); // 134 events, 50 a page
    const [name, csv] = download.mock.calls[0] as [string, string];
    expect(name).toMatch(/^havana-hospital-activity-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(
      csv.startsWith("\uFEFFTime (UTC),Who,Type,What happened,Flag\r\n"),
    ).toBe(true);
    expect(csv.trim().split("\r\n")).toHaveLength(135);
    expect(await screen.findByText("Activity exported")).toBeInTheDocument();
  });

  it("never shows or exports a field the contract doesn't have (privacy)", async () => {
    vi.spyOn(holder.client, "listActivity").mockResolvedValue({
      events: [
        {
          ...makeEvent({
            kind: "consultation_run",
            type: "consultation",
            specialty: "Cardiology",
            confidence: "high",
          }),
          question_text: "54 M, John Smith, chest pain",
          result: "Likely unstable angina for John Smith",
        } as never,
      ],
      next_cursor: null,
    });
    renderAdmin(<ActivityView />);
    expect(
      await rowWith("Ran a consultation · Cardiology · High confidence"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/John Smith|chest pain|angina/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(download).toHaveBeenCalled());
    const [, csv] = download.mock.calls[0] as [string, string];
    expect(csv).toContain("Ran a consultation · Cardiology · High confidence");
    expect(csv).not.toMatch(/John Smith|chest pain|angina/);
  });

  it("says how long the log is kept, which time zone, and links the two tabs", async () => {
    renderAdmin(<ActivityView />);
    await log();
    expect(
      screen.getByText(
        "Kept for 12 months. No question text, results or patient details are recorded here.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Times on screen are in your local time. The CSV file uses UTC.",
      ),
    ).toBeInTheDocument();
    const tabs = screen.getByRole("navigation", { name: "Activity" });
    expect(within(tabs).getByRole("link", { name: "Log" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      await within(tabs).findByRole("link", {
        name: "Review oversight · 1 overdue",
      }),
    ).toHaveAttribute("href", "/admin/activity/oversight");
  });

  it("keeps the log readable offline; Export and Load more are off with the reason", async () => {
    renderAdmin(<ActivityView />);
    await log();
    await userEvent.selectOptions(screen.getByLabelText("Dates"), "12m");
    await waitFor(async () => expect(rows(await log())).toHaveLength(50));
    goOffline();
    try {
      const reason = "You're offline. Reconnect to export or load more.";
      const note = screen.getByText(reason);
      for (const name of ["Export CSV", "Load more"]) {
        const b = screen.getByRole("button", { name });
        expect(b).toBeDisabled();
        expect(b).toHaveAttribute("aria-describedby", note.id);
      }
      expect(rows(await log())).toHaveLength(50);
    } finally {
      goOnline();
    }
  });

  it("says so, not a skeleton, when first opened offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    onlineManager.setOnline(false);
    renderAdmin(<ActivityView />);
    expect(
      await screen.findByText(
        "You're offline. The activity will load when you reconnect.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("offers Try again when the first load fails", async () => {
    const spy = vi
      .spyOn(holder.client, "listActivity")
      .mockRejectedValueOnce(new ApiError(403, "forbidden"));
    renderAdmin(<ActivityView />);
    const again = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("alert")).toHaveTextContent("You can't do this");
    spy.mockRestore();
    await userEvent.click(again);
    expect((await log()).querySelectorAll("tbody tr").length).toBeGreaterThan(
      0,
    );
  });

  it("keeps the rows when a refresh fails, with the banner above them", async () => {
    const spy = vi.spyOn(holder.client, "listActivity");
    renderAdmin(<ActivityView />);
    const before = rows(await log()).length;
    spy.mockRejectedValue(new ApiError(403, "forbidden"));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(rows(await log())).toHaveLength(before);
  });

  it("keeps Export on when a refresh fails but the rows are still shown", async () => {
    const spy = vi.spyOn(holder.client, "listActivity");
    renderAdmin(<ActivityView />);
    await log();
    const exportButton = screen.getByRole("button", { name: "Export CSV" });
    await waitFor(() => expect(exportButton).toBeEnabled());
    spy.mockRejectedValue(new ApiError(403, "forbidden"));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("shows phone cards with the same words", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderAdmin(<ActivityView />);
    const cards = await screen.findByRole("list", {
      name: "Activity at the hospital",
    });
    expect(
      within(cards).getByText(
        "5 failed sign-ins for Dr. Bello · account locked",
      ),
    ).toBeInTheDocument();
    expect(within(cards).getAllByText("Alert").length).toBeGreaterThan(0);
  });
});
