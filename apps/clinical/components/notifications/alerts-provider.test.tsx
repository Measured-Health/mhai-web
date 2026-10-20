import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertOut, AlertSeverity } from "@/lib/api/alerts-contract";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { NOTIFY_KEYS } from "@/lib/notification-queries";
import { makeAlert } from "@/tests/alerts";
import { T0, makeCorrection } from "@/tests/corrections";
import { TOAST_MAX, ToastProvider } from "@mhai/ui/toast";

const alerts = vi.hoisted(() => ({
  listAlerts: vi.fn(),
  getUnreadCount: vi.fn(),
  getNotificationSettings: vi.fn(),
  acknowledgeAlert: vi.fn(),
  dismissAlert: vi.fn(),
  updateNotificationSettings: vi.fn(),
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
import { useDecisions } from "../corrections/decisions-provider";
import { ShellContext, type ShellCtx } from "../shell/shell-context";
import { AlertsProvider, useAlerts } from "./alerts-provider";
import { NotificationsProvider } from "./notifications-provider";

const page = (list: AlertOut[]) => ({
  alerts: list,
  next_cursor: null,
  sources: ["Main record"],
});
const OLD = makeAlert({
  id: "old",
  created_at: new Date(Date.now() - 3_600_000).toISOString(),
});
/** Created after the provider started, so it's new to it. */
const arriving = (
  id: string,
  severity: AlertSeverity,
  name: string,
  minutes = 1,
) =>
  makeAlert({
    id,
    severity,
    created_at: new Date(Date.now() + minutes * 60_000).toISOString(),
    patient: { ...makeAlert().patient, full_name: name },
  });

function Probe() {
  const a = useAlerts();
  return (
    <p>{`unread ${a?.unread} · focus ${a?.focusId ?? "none"} · available ${String(a?.available)}`}</p>
  );
}
function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AlertsProvider>
          <Probe />
          <button type="button">elsewhere</button>
        </AlertsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const ready = (qc: QueryClient) =>
  vi.waitFor(() => {
    expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("success");
    expect(qc.getQueryState(NOTIFY_KEYS.settings)?.status).toBe("success");
  });
const poll = (qc: QueryClient) =>
  act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.feed }));
const live = (kind: "polite" | "assertive") =>
  document.querySelector(`[aria-live="${kind}"]`)!;

beforeEach(() => {
  for (const f of Object.values(alerts)) f.mockReset();
  alerts.listAlerts.mockResolvedValue(page([]));
  alerts.getUnreadCount.mockResolvedValue({ count: 0 });
  alerts.getNotificationSettings.mockResolvedValue({
    alert_popups: true,
    correction_popups: true,
  });
  listMine.mockReset();
  listMine.mockResolvedValue([]);
  push.mockClear();
});

describe("alert pop-ups", () => {
  it("never pops up alerts that were there at sign-in", async () => {
    alerts.listAlerts.mockResolvedValueOnce(page([OLD]));
    const qc = ui();
    await ready(qc);
    await act(() => Promise.resolve());
    expect(screen.queryByText(/patient alert$/)).toBeNull();
  });

  it("pops up nothing on the first answer, even a Critical (baseline)", async () => {
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("c0", "critical", "Halima Garba")]),
    );
    const qc = ui();
    await ready(qc);
    await act(() => Promise.resolve());
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(0);
    expect(live("assertive")).toBeEmptyDOMElement();
  });

  it("still pops an unseen Critical older than the watermark, with alert pop-ups off", async () => {
    alerts.getNotificationSettings.mockResolvedValue({
      alert_popups: false,
      correction_popups: true,
    });
    const recent = makeAlert({
      id: "recent",
      severity: "urgent",
      created_at: new Date(Date.now() - 600_000).toISOString(),
    });
    alerts.listAlerts.mockResolvedValueOnce(page([recent]));
    const qc = ui();
    await ready(qc);
    const late = makeAlert({
      id: "late",
      severity: "critical",
      created_at: new Date(Date.now() - 7_200_000).toISOString(),
      patient: { ...makeAlert().patient, full_name: "Late Visible" },
    });
    alerts.listAlerts.mockResolvedValueOnce(page([late, recent]));
    await poll(qc);
    expect(await screen.findByText("Critical patient alert")).toBeVisible();
    expect(screen.getByText(/^Late Visible/)).toBeVisible();
  });

  it("never pops an id it has already seen again", async () => {
    const qc = ui();
    await ready(qc);
    const n1 = arriving("n1", "urgent", "Emeka Nnamdi");
    alerts.listAlerts.mockResolvedValueOnce(page([n1]));
    await poll(qc);
    await screen.findByText("Urgent patient alert");
    await userEvent.click(
      screen.getByRole("button", {
        name: /^Hide pop-up: Urgent patient alert/,
      }),
    );
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
    const before = qc.getQueryState(NOTIFY_KEYS.feed)!.dataUpdateCount;
    alerts.listAlerts.mockResolvedValueOnce(page([n1]));
    await poll(qc);
    // Wait for that answer to land, not for a number of calls.
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)!.dataUpdateCount).toBe(
        before + 1,
      ),
    );
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
  });

  it("pops up a new alert politely, and View opens it", async () => {
    alerts.listAlerts.mockResolvedValueOnce(page([OLD]));
    const qc = ui();
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("n1", "urgent", "Emeka Nnamdi"), OLD]),
    );
    await poll(qc);
    expect(await screen.findByText("Urgent patient alert")).toBeVisible();
    expect(
      screen.getByText(
        "Emeka Nnamdi · Potassium 2.9 mmol/L (low; normal 3.5–5.1)",
      ),
    ).toBeVisible();
    expect(live("polite")).toHaveTextContent("Urgent patient alert");
    expect(live("assertive")).toBeEmptyDOMElement();
    await userEvent.click(
      screen.getByRole("button", { name: "View alert for Emeka Nnamdi" }),
    );
    expect(push).toHaveBeenCalledWith("/notifications");
    expect(screen.getByText(/focus n1/)).toBeInTheDocument();
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
  });

  it("with alert pop-ups off, Urgent stays quiet but Critical pops up, assertively (Review Focus 2)", async () => {
    alerts.getNotificationSettings.mockResolvedValue({
      alert_popups: false,
      correction_popups: true,
    });
    const qc = ui();
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([
        arriving("u1", "urgent", "Emeka Nnamdi"),
        arriving("c1", "critical", "Halima Garba"),
      ]),
    );
    alerts.getUnreadCount.mockResolvedValue({ count: 2 });
    await poll(qc);
    expect(await screen.findByText("Critical patient alert")).toBeVisible();
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
    expect(live("assertive")).toHaveTextContent(
      "Critical patient alert. Halima Garba",
    );
    expect(
      screen.getByRole("button", {
        name: /^Hide pop-up: Critical patient alert/,
      }),
    ).toBeVisible();
    // The count still rises.
    await act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }));
    expect(await screen.findByText(/unread 2/)).toBeInTheDocument();
  });

  it("a burst of eight shows three pop-ups and one summary (Review Focus 3)", async () => {
    const qc = ui();
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([
        ...["u1", "u2", "u3", "u4", "u5", "u6"].map((id, i) =>
          arriving(id, "urgent", `Urgent person ${i + 1}`, i + 1),
        ),
        arriving("c1", "critical", "Critical person 1", 7),
        arriving("c2", "critical", "Critical person 2", 8),
      ]),
    );
    await poll(qc);
    expect(await screen.findByText("5 more new patient alerts")).toBeVisible();
    expect(screen.getAllByText("Critical patient alert")).toHaveLength(2);
    expect(screen.getAllByText("Urgent patient alert")).toHaveLength(1);
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(TOAST_MAX);
    await userEvent.click(
      screen.getByRole("button", { name: "View all new patient alerts" }),
    );
    expect(push).toHaveBeenCalledWith("/notifications");
    expect(screen.getByText(/focus none/)).toBeInTheDocument();
  });

  it("never takes the focus", async () => {
    const qc = ui();
    await ready(qc);
    screen.getByRole("button", { name: "elsewhere" }).focus();
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("c1", "critical", "Halima Garba")]),
    );
    await poll(qc);
    await screen.findByText("Critical patient alert");
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("takes the first answer after a failed one as the baseline, popping nothing (F14)", async () => {
    alerts.listAlerts.mockRejectedValue(new ApiError(400, "bad"));
    const qc = ui();
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("error"),
    );
    alerts.listAlerts.mockResolvedValue(
      page([arriving("c1", "critical", "Halima Garba")]),
    );
    await poll(qc);
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)?.status).toBe("success"),
    );
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(0);
    expect(live("assertive")).toBeEmptyDOMElement();
  });

  it("follows a settings change mid-session: Urgent then stays quiet (F14)", async () => {
    const qc = ui();
    await ready(qc);
    act(() =>
      qc.setQueryData(NOTIFY_KEYS.settings, {
        alert_popups: false,
        correction_popups: true,
      }),
    );
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("u1", "urgent", "Emeka Nnamdi")]),
    );
    const before = qc.getQueryState(NOTIFY_KEYS.feed)!.dataUpdateCount;
    await poll(qc);
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)!.dataUpdateCount).toBe(
        before + 1,
      ),
    );
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
    expect(live("polite")).toBeEmptyDOMElement();
  });

  it("refreshes the alert lists when the unread count changes (F5)", async () => {
    const qc = ui();
    await ready(qc);
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.unread)?.status).toBe("success"),
    );
    const key = NOTIFY_KEYS.list({ status: "new" });
    const fresh = () => qc.setQueryData(key, { pages: [], pageParams: [] });
    act(fresh);
    // The same count leaves the lists alone.
    await act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }));
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
    // More: the lists are refreshed.
    alerts.getUnreadCount.mockResolvedValue({ count: 3 });
    await act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }));
    await vi.waitFor(() =>
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true),
    );
    // Fewer (handled here or elsewhere): marked out of date too.
    act(fresh);
    alerts.getUnreadCount.mockResolvedValue({ count: 1 });
    await act(() => qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }));
    await vi.waitFor(() =>
      expect(qc.getQueryState(key)?.isInvalidated).toBe(true),
    );
  });

  it("forgets the alert when the unsaved-draft guard refuses a View (F6)", async () => {
    const shell: ShellCtx = {
      openDrawer() {},
      openSearch() {},
      openShortcuts() {},
      closeDrawer() {},
      searchOpen: false,
      closeSearch() {},
      navigate: () => false,
      setNavigationGuard() {},
    };
    function Opener() {
      const a = useAlerts();
      return (
        <button type="button" onClick={() => a?.openAlert("al-1")}>
          open
        </button>
      );
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ToastProvider>
          <ShellContext.Provider value={shell}>
            <AlertsProvider>
              <Opener />
              <Probe />
            </AlertsProvider>
          </ShellContext.Provider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    expect(screen.getByText(/focus none/)).toBeInTheDocument();
  });

  it("says when alerts aren't switched on, and counts nothing (R12)", async () => {
    alerts.listAlerts.mockRejectedValue(new ApiError(404, "not_found"));
    alerts.getUnreadCount.mockRejectedValue(new ApiError(404, "not_found"));
    ui();
    expect(await screen.findByText(/available false/)).toBeInTheDocument();
    expect(screen.getByText(/unread 0/)).toBeInTheDocument();
  });
});

describe("the notification centre at sign-out", () => {
  function Shell() {
    const [signedIn, setSignedIn] = useState(true);
    return (
      <>
        {signedIn && (
          <NotificationsProvider>
            <Probe />
          </NotificationsProvider>
        )}
        <button type="button" onClick={() => setSignedIn(false)}>
          sign out
        </button>
      </>
    );
  }

  it("signing out clears every pop-up and keeps nothing (Review Focus 5)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await ready(qc);
    alerts.listAlerts.mockResolvedValueOnce(
      page([arriving("c1", "critical", "Halima Garba")]),
    );
    await poll(qc);
    expect(await screen.findByText("Critical patient alert")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    expect(screen.queryByText("Critical patient alert")).toBeNull();
    expect(document.body.textContent).not.toContain("Halima Garba");
    expect(live("assertive")).toBeEmptyDOMElement();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe("signing out and back in (F14)", () => {
  it("starts a fresh baseline: alerts that came meanwhile don't pop up", async () => {
    const qc = new QueryClient();
    function Shell() {
      const [signedIn, setSignedIn] = useState(true);
      return (
        <>
          {signedIn && (
            <NotificationsProvider>
              <Probe />
            </NotificationsProvider>
          )}
          <button
            type="button"
            onClick={() => {
              setSignedIn(false);
              // As SessionProvider.clear() does at sign-out.
              qc.clear();
            }}
          >
            sign out
          </button>
          <button type="button" onClick={() => setSignedIn(true)}>
            sign in
          </button>
        </>
      );
    }
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </QueryClientProvider>,
    );
    await ready(qc);
    await userEvent.click(screen.getByRole("button", { name: "sign out" }));
    alerts.listAlerts.mockResolvedValue(
      page([arriving("c1", "critical", "Halima Garba")]),
    );
    await userEvent.click(screen.getByRole("button", { name: "sign in" }));
    await ready(qc);
    await vi.waitFor(() =>
      expect(qc.getQueryState(NOTIFY_KEYS.feed)?.data).toMatchObject({
        alerts: [expect.objectContaining({ id: "c1" })],
      }),
    );
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(0);
    expect(live("assertive")).toBeEmptyDOMElement();
  });
});

describe("decision pop-ups", () => {
  function Decisions() {
    const d = useDecisions();
    return <p>{`unseen ${d?.unseen}`}</p>;
  }
  const decided: CorrectionOut = {
    ...makeCorrection({ id: "c1" }),
    status: "approved",
    decided_by: {
      display_name: "Dr. Bello",
      full_name: null,
      specialty: null,
      hospital: null,
    },
    decided_at: new Date(T0).toISOString(),
  };
  async function decide(correction_popups: boolean) {
    alerts.getNotificationSettings.mockResolvedValue({
      alert_popups: true,
      correction_popups,
    });
    listMine.mockResolvedValueOnce([makeCorrection({ id: "c1" })]);
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <NotificationsProvider>
            <Decisions />
          </NotificationsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await vi.waitFor(() => {
      expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success");
      expect(qc.getQueryState(NOTIFY_KEYS.settings)?.status).toBe("success");
    });
    listMine.mockResolvedValueOnce([decided]);
    await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
    await screen.findByText("unseen 1");
  }

  it("pops up a decision with View, which opens the Corrections tab", async () => {
    await decide(true);
    expect(screen.getByText("Your correction was approved")).toBeVisible();
    expect(live("polite")).toHaveTextContent("Your correction was approved");
    await userEvent.click(
      screen.getByRole("button", {
        name: "View decision: Dengue fever, likely",
      }),
    );
    expect(push).toHaveBeenCalledWith("/notifications/corrections");
  });

  it("follows a settings change mid-session: the next decision stays quiet", async () => {
    alerts.getNotificationSettings.mockResolvedValue({
      alert_popups: true,
      correction_popups: true,
    });
    listMine.mockResolvedValueOnce([makeCorrection({ id: "c1" })]);
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <NotificationsProvider>
            <Decisions />
          </NotificationsProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    await vi.waitFor(() => {
      expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success");
      expect(qc.getQueryState(NOTIFY_KEYS.settings)?.status).toBe("success");
    });
    act(() =>
      qc.setQueryData(NOTIFY_KEYS.settings, {
        alert_popups: true,
        correction_popups: false,
      }),
    );
    listMine.mockResolvedValueOnce([decided]);
    await act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));
    // Still counted on the bell, but no pop-up.
    await screen.findByText("unseen 1");
    expect(screen.queryByText("Your correction was approved")).toBeNull();
    expect(live("polite")).toBeEmptyDOMElement();
  });

  it("keeps decisions quiet when decision pop-ups are off, but still counts them", async () => {
    await decide(false);
    expect(screen.queryByText("Your correction was approved")).toBeNull();
  });
});
