import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { NOTIFY_KEYS } from "@/lib/notification-queries";
import { at, makeAlert } from "@/tests/alerts";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "@mhai/ui/toast";

const alerts = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getUnreadCount: vi.fn(),
  getNotificationSettings: vi.fn(),
}));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => alerts }));
const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));
import { SeverityChip } from "./chips";
import { BELL_ALERTS, NotificationBell } from "./notification-bell";
import { NotificationsProvider } from "./notifications-provider";

const NAMES = [
  "Maryam Abdullahi",
  "Ibrahim Danladi",
  "Esther Okoye",
  "Samuel Bassey",
  "Blessing Uche",
  "Kemi Afolabi",
];
const SIX = NAMES.map((full_name, i) =>
  makeAlert({ id: `a${i}`, patient: { ...makeAlert().patient, full_name } }),
);
const waiting = makeCorrection({ id: "c1" });
const approved: CorrectionOut = {
  ...waiting,
  status: "approved",
  decided_by: {
    display_name: "Dr. Bello",
    full_name: null,
    specialty: null,
    hospital: null,
  },
  decided_at: new Date(T0).toISOString(),
};

function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <NotificationsProvider>
          <NotificationBell />
          <button type="button">elsewhere</button>
        </NotificationsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const bell = (name: string) => screen.findByRole("button", { name });

/** Six new alerts, then one decision arrives: 7 unread. */
async function withDecision() {
  listMine.mockResolvedValueOnce([waiting]);
  const qc = ui();
  expect(await bell("Notifications, 6 unread")).toBeInTheDocument();
  await vi.waitFor(() =>
    expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
  );
  listMine.mockResolvedValueOnce([approved]);
  await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
  return bell("Notifications, 7 unread");
}

beforeEach(() => {
  alerts.listAlerts.mockReset().mockResolvedValue({
    alerts: SIX,
    next_cursor: null,
    sources: ["Main record"],
  });
  alerts.getUnreadCount.mockReset().mockResolvedValue({ count: 6 });
  alerts.getNotificationSettings
    .mockReset()
    .mockResolvedValue({ alert_popups: true, correction_popups: true });
  listMine.mockReset().mockResolvedValue([]);
  push.mockClear();
});

describe("NotificationBell", () => {
  it("counts new alerts and unseen decisions as one, and says it (R1)", async () => {
    expect(await withDecision()).toBeInTheDocument();
  });

  it("lists the latest of both, and opening it clears only the decisions (R1)", async () => {
    const user = userEvent.setup();
    await user.click(await withDecision());
    const panel = screen.getByRole("region", { name: "Recent notifications" });
    const list = within(panel).getByRole("region", { name: "Patient alerts" });
    expect(within(list).getAllByRole("button")).toHaveLength(BELL_ALERTS);
    expect(within(list).getByText("Maryam Abdullahi")).toBeVisible();
    expect(within(list).queryByText("Kemi Afolabi")).toBeNull();
    expect(within(list).getAllByText("Ward 3 · Bed 12")[0]).toBeVisible();
    const decisions = within(panel).getByRole("region", {
      name: "Decisions on your corrections",
    });
    expect(within(decisions).getByText("Dengue fever, likely")).toBeVisible();
    expect(within(decisions).getByText("Approved")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "See all" }),
    ).toHaveAttribute("href", "/notifications");
    expect(
      screen.getByRole("button", { name: "Notifications, 6 unread" }),
    ).toBeInTheDocument();
  });

  it("opens the alert you choose, closing the panel", async () => {
    const user = userEvent.setup();
    ui();
    await user.click(await bell("Notifications, 6 unread"));
    await user.click(screen.getByRole("button", { name: /Esther Okoye/ }));
    expect(push).toHaveBeenCalledWith("/notifications");
    expect(
      screen.queryByRole("region", { name: "Recent notifications" }),
    ).toBeNull();
  });

  it("moves focus in, closes with Esc back to the bell, and on a click elsewhere", async () => {
    const user = userEvent.setup();
    ui();
    const b = await bell("Notifications, 6 unread");
    await user.click(b);
    expect(
      screen.getByRole("button", { name: /Maryam Abdullahi/ }),
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Recent notifications" }),
    ).toBeNull();
    expect(b).toHaveFocus();
    await user.click(b);
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(
      screen.queryByRole("region", { name: "Recent notifications" }),
    ).toBeNull();
  });

  it("says when there's nothing yet", async () => {
    const user = userEvent.setup();
    alerts.listAlerts.mockResolvedValue({
      alerts: [],
      next_cursor: null,
      sources: [],
    });
    alerts.getUnreadCount.mockResolvedValue({ count: 0 });
    ui();
    await user.click(await bell("Notifications"));
    expect(screen.getByText("No new patient alerts.")).toBeVisible();
    expect(screen.getByText(/No decisions yet/)).toBeVisible();
    expect(
      screen.getByText("Decisions are kept for this session only."),
    ).toBeVisible();
  });

  it("shows decisions only when alerts aren't switched on (R12)", async () => {
    const user = userEvent.setup();
    alerts.listAlerts.mockRejectedValue(new ApiError(404, "not_found"));
    alerts.getUnreadCount.mockRejectedValue(new ApiError(404, "not_found"));
    const qc = ui();
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("error"),
    );
    await user.click(await bell("Notifications"));
    expect(screen.queryByRole("region", { name: "Patient alerts" })).toBeNull();
    expect(
      screen.getByRole("region", { name: "Decisions on your corrections" }),
    ).toBeVisible();
  });

  it("says when the count couldn't be checked, with a warning mark (F3)", async () => {
    alerts.getUnreadCount.mockRejectedValue(new ApiError(400, "bad"));
    ui();
    const b = await bell("Notifications, couldn't check for new alerts");
    const mark = b.querySelector("[data-count-failed]");
    expect(mark).toBeTruthy();
    expect(mark!.querySelector("svg")).toBeTruthy();
  });

  it("keeps the unseen decisions in the name and badge when the alert count fails", async () => {
    alerts.getUnreadCount.mockRejectedValue(new ApiError(400, "bad"));
    const waiting2 = makeCorrection({ id: "c2" });
    listMine.mockResolvedValueOnce([waiting, waiting2]);
    const qc = ui();
    await bell("Notifications, couldn't check for new alerts");
    await vi.waitFor(() =>
      expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
    );
    listMine.mockResolvedValueOnce([approved, { ...approved, id: "c2" }]);
    await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
    const b = await bell(
      "Notifications, 2 unread, couldn't check for new alerts",
    );
    const mark = b.querySelector("[data-count-failed]");
    expect(mark).toBeTruthy();
    expect(mark!.querySelector("svg")).toBeTruthy();
    expect(mark).toHaveTextContent("2");
  });

  it("shows loading in the panel until the alerts arrive, never 'no alerts' (F3)", async () => {
    const user = userEvent.setup();
    // One check is two reads (the feed and the Criticals): hold both.
    const held: (() => void)[] = [];
    const release = () => held.forEach((r) => r());
    alerts.listAlerts.mockImplementation(
      () =>
        new Promise((r) => {
          held.push(() => r({ alerts: [], next_cursor: null, sources: [] }));
        }),
    );
    ui();
    await user.click(await bell("Notifications, 6 unread"));
    const list = screen.getByRole("region", { name: "Patient alerts" });
    expect(within(list).getByText("Loading…")).toBeVisible();
    expect(within(list).queryByText("No new patient alerts.")).toBeNull();
    await act(async () => release());
    expect(
      await within(list).findByText("No new patient alerts."),
    ).toBeVisible();
  });

  it("says the alerts couldn't load in the panel, never 'no alerts' (F3)", async () => {
    const user = userEvent.setup();
    alerts.listAlerts.mockRejectedValue(new ApiError(400, "bad"));
    const qc = ui();
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("error"),
    );
    await user.click(await bell("Notifications, 6 unread"));
    const list = screen.getByRole("region", { name: "Patient alerts" });
    expect(
      within(list).getByText("Couldn't load patient alerts"),
    ).toBeVisible();
    expect(within(list).queryByText("No new patient alerts.")).toBeNull();
  });

  it("points at the panel only while it's open (F3)", async () => {
    const user = userEvent.setup();
    ui();
    const b = await bell("Notifications, 6 unread");
    expect(b).not.toHaveAttribute("aria-controls");
    await user.click(b);
    const panel = screen.getByRole("region", { name: "Recent notifications" });
    expect(b).toHaveAttribute("aria-controls", panel.id);
  });

  it("closes with Esc when focus is on the panel itself (F3)", async () => {
    const user = userEvent.setup();
    ui();
    const b = await bell("Notifications, 6 unread");
    await user.click(b);
    const panel = screen.getByRole("region", { name: "Recent notifications" });
    await user.click(within(panel).getByText("Recent notifications"));
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Recent notifications" }),
    ).toBeNull();
    expect(b).toHaveFocus();
  });

  it("caps the badge at 99+ but says the number", async () => {
    alerts.getUnreadCount.mockResolvedValue({ count: 140 });
    ui();
    expect(await bell("Notifications, 140 unread")).toHaveTextContent("99+");
  });

  it("shows Criticals first, then the newest others, up to the cap", async () => {
    const user = userEvent.setup();
    const mixed = [
      makeAlert({
        id: "u1",
        created_at: at(8, 50),
        severity: "urgent",
        patient: { ...makeAlert().patient, full_name: "Urgent One" },
      }),
      makeAlert({
        id: "i1",
        created_at: at(8, 49),
        severity: "info",
        patient: { ...makeAlert().patient, full_name: "Info One" },
      }),
      makeAlert({
        id: "u2",
        created_at: at(8, 48),
        severity: "urgent",
        patient: { ...makeAlert().patient, full_name: "Urgent Two" },
      }),
      makeAlert({
        id: "c1",
        created_at: at(8, 10),
        severity: "critical",
        patient: { ...makeAlert().patient, full_name: "Critical Old" },
      }),
      makeAlert({
        id: "u3",
        created_at: at(8, 47),
        severity: "urgent",
        patient: { ...makeAlert().patient, full_name: "Urgent Three" },
      }),
    ];
    alerts.listAlerts.mockResolvedValue({
      alerts: mixed,
      next_cursor: null,
      sources: [],
    });
    alerts.getUnreadCount.mockResolvedValue({ count: 5 });
    ui();
    await user.click(await bell("Notifications, 5 unread"));
    const list = screen.getByRole("region", { name: "Patient alerts" });
    const names = within(list)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    expect(names).toHaveLength(BELL_ALERTS);
    expect(names[0]).toContain("Critical Old");
    expect(names[1]).toContain("Urgent One");
    expect(within(list).queryByText("Urgent Three")).toBeNull();
  });

  it("marks an unstandardised finding and a missing location", async () => {
    const user = userEvent.setup();
    const a = makeAlert({ id: "x" });
    alerts.listAlerts.mockResolvedValue({
      alerts: [
        {
          ...a,
          finding: { ...a.finding, standardised: false },
          patient: { ...a.patient, location: null },
        },
      ],
      next_cursor: null,
      sources: [],
    });
    ui();
    await user.click(await bell("Notifications, 6 unread"));
    expect(screen.getByText("Not standardised")).toBeVisible();
    expect(screen.getByText("Location not recorded")).toBeVisible();
  });

  it("keeps patient details off paper: panel and pop-ups are print:hidden (B4)", async () => {
    const user = userEvent.setup();
    ui();
    await user.click(await bell("Notifications, 6 unread"));
    expect(
      screen.getByRole("region", { name: "Recent notifications" }),
    ).toHaveClass("print:hidden");
  });

  it("renders nothing outside the notification centre", () => {
    const { container } = render(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SeverityChip", () => {
  it("shows the word and an icon, and reads an unknown severity as Urgent", () => {
    const { rerender } = render(<SeverityChip severity="critical" />);
    expect(screen.getByText("Critical").querySelector("svg")).toBeTruthy();
    rerender(<SeverityChip severity="catastrophic" />);
    expect(screen.getByText("Urgent").querySelector("svg")).toBeTruthy();
  });
});

describe("NotificationBell: routing", () => {
  it("queue-only alerts count on the bell", async () => {
    const queued = makeAlert({
      id: "q1",
      severity: "urgent",
      routing: { to_you: false, queue: true },
    });
    alerts.listAlerts.mockResolvedValue({
      alerts: [queued],
      next_cursor: null,
      sources: ["Main record"],
    });
    alerts.getUnreadCount.mockResolvedValue({ count: 1 });
    const user = userEvent.setup();
    ui();
    await user.click(await bell("Notifications, 1 unread"));
    const list = screen.getByRole("region", { name: "Patient alerts" });
    expect(within(list).getByText("Hospital queue")).toBeVisible();
  });
});
