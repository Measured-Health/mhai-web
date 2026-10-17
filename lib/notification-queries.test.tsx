import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { createMockAlerts, MOCK_ALERT_EVERY_MS } from "@/lib/api/mock-alerts";
import type {
  AlertOut,
  NotificationSettingsPatchIn,
} from "@/lib/api/alerts-contract";
import { ALERT_NOW, makeAlert, mockAlerts } from "@/tests/alerts";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
import { ApiError } from "./api/errors";
import {
  ALERT_SLOW_MS,
  DEFAULT_SETTINGS,
  FEED_SIZE,
  NOTIFY_KEYS,
  alertsOff,
  alertsRecheck,
  useAcknowledgeAlert,
  useAlertFeed,
  useAlertList,
  useDismissAlert,
  useNotificationSettings,
  usePopupSettings,
  useUnreadAlerts,
  useUpdateNotificationSettings,
} from "./notification-queries";

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(() => {
  qc = new QueryClient();
  holder.client = mockAlerts();
});
afterEach(() => vi.restoreAllMocks());

const useNewList = () => ({
  list: useAlertList({ status: "new" }),
  unread: useUnreadAlerts(),
  ack: useAcknowledgeAlert(),
  dismiss: useDismissAlert(),
});

describe("alert queries", () => {
  it("reads the newest new alerts and the unread count", async () => {
    const { result } = renderHook(
      () => ({ feed: useAlertFeed(), unread: useUnreadAlerts() }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.feed.data?.alerts).toHaveLength(6),
    );
    await waitFor(() => expect(result.current.unread.data).toBe(6));
  });

  it("keeps an older Critical in the feed when newer alerts fill the first page", async () => {
    const rows: AlertOut[] = [
      ...Array.from({ length: FEED_SIZE + 5 }, (_, i) =>
        makeAlert({
          id: `u-${i}`,
          severity: "urgent",
          created_at: new Date(ALERT_NOW - i * 60_000).toISOString(),
        }),
      ),
      makeAlert({
        id: "old-critical",
        severity: "critical",
        created_at: new Date(ALERT_NOW - 3_600_000).toISOString(),
      }),
    ];
    vi.spyOn(holder.client, "listAlerts").mockImplementation(async (q) => {
      const all = rows.filter(
        (a) =>
          (!q.status || a.status === q.status) &&
          (!q.severity || a.severity === q.severity),
      );
      const from = q.cursor ? Number(q.cursor) : 0;
      const size = q.limit ?? 20;
      return {
        alerts: all.slice(from, from + size),
        next_cursor: from + size < all.length ? String(from + size) : null,
        sources: [],
      };
    });
    const { result } = renderHook(() => useAlertFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const ids = result.current.data!.alerts.map((a) => a.id);
    expect(ids).toContain("old-critical");
    expect(ids).toHaveLength(FEED_SIZE + 1);
    expect(new Set(ids).size).toBe(ids.length);
    const times = result.current.data!.alerts.map((a) => a.created_at);
    expect(times).toEqual([...times].sort().reverse());
  });

  it("follows Critical cursors, but only up to a page cap", async () => {
    const rows = Array.from({ length: FEED_SIZE * 8 }, (_, i) =>
      makeAlert({
        id: `c-${i}`,
        created_at: new Date(ALERT_NOW - i * 60_000).toISOString(),
      }),
    );
    const list = vi
      .spyOn(holder.client, "listAlerts")
      .mockImplementation(async (q) => {
        const from = q.cursor ? Number(q.cursor) : 0;
        const size = q.limit ?? 20;
        return {
          alerts: rows.slice(from, from + size),
          next_cursor: from + size < rows.length ? String(from + size) : null,
          sources: [],
        };
      });
    const { result } = renderHook(() => useAlertFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const critical = list.mock.calls.filter(
      (c) => c[0].severity === "critical",
    );
    expect(critical).toHaveLength(5);
    expect(result.current.data!.alerts).toHaveLength(FEED_SIZE * 5);
  });

  it("puts alerts with an unreadable time last, in a steady order", async () => {
    const rows = [
      makeAlert({ id: "b-bad", created_at: "not a time" }),
      makeAlert({ id: "a-bad", created_at: "" }),
      makeAlert({ id: "good", created_at: new Date(ALERT_NOW).toISOString() }),
    ];
    vi.spyOn(holder.client, "listAlerts").mockImplementation(async () => ({
      alerts: rows,
      next_cursor: null,
      sources: [],
    }));
    const { result } = renderHook(() => useAlertFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.alerts.map((a) => a.id)).toEqual([
      "good",
      "a-bad",
      "b-bad",
    ]);
  });

  it("stops following Critical cursors on an empty page, and the feed is not pageable", async () => {
    const list = vi
      .spyOn(holder.client, "listAlerts")
      .mockImplementation(async () => ({
        alerts: [],
        next_cursor: "more",
        sources: [],
      }));
    const { result } = renderHook(() => useAlertFeed(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(
      list.mock.calls.filter((c) => c[0].severity === "critical"),
    ).toHaveLength(1);
    expect(result.current.data!.next_cursor).toBeNull();
  });

  it("lists by filter and pages with the cursor", async () => {
    let t = ALERT_NOW;
    holder.client = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 40 * MOCK_ALERT_EVERY_MS;
    const { result } = renderHook(
      () => ({
        news: useAlertList({ status: "new" }),
        handled: useAlertList({ status: "handled" }),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(
        result.current.handled.data?.pages[0]?.alerts.map((a) => a.id),
      ).toEqual(["al-107"]),
    );
    await waitFor(() => expect(result.current.news.hasNextPage).toBe(true));
    await act(() => result.current.news.fetchNextPage());
    await waitFor(() =>
      expect(
        result.current.news.data?.pages.flatMap((p) => p.alerts),
      ).toHaveLength(36),
    );
    expect(result.current.news.hasNextPage).toBe(false);
  });

  it("sends one idempotency key per acknowledge, reused on its retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // shortest retry delay
    const ack = vi
      .spyOn(holder.client, "acknowledgeAlert")
      .mockRejectedValueOnce(new ApiError(503, "error"));
    const { result } = renderHook(() => useAcknowledgeAlert(), { wrapper });
    act(() => result.current.mutate("al-101"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 4000,
    });
    const keys = ack.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    act(() => result.current.mutate("al-102"));
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(3));
    expect(ack.mock.calls[2]![1]?.idempotencyKey).not.toBe(keys[0]);
  });

  it("puts your handled copy into the cached list at once and refreshes the count (R6)", async () => {
    const { result } = renderHook(useNewList, { wrapper });
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6),
    );
    act(() => result.current.ack.mutate("al-101"));
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts[0]).toMatchObject({
        id: "al-101",
        status: "handled",
        handled_by: { display_name: "Dr. Reyes" },
      }),
    );
    // It stays where it is until the list loads again.
    expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6);
    await waitFor(() => expect(result.current.unread.data).toBe(5));
  });

  it("puts the colleague's who and when into the cached lists on a 409 (Review Focus 1)", async () => {
    const ack = vi.spyOn(holder.client, "acknowledgeAlert");
    const { result } = renderHook(useNewList, { wrapper });
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6),
    );
    holder.client.handleElsewhere("al-102", "Dr. Okafor");
    const onError = vi.fn();
    act(() => result.current.ack.mutate("al-102", { onError }));
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.list.data?.pages[0]?.alerts[1]).toMatchObject({
      id: "al-102",
      status: "handled",
      handled_by: { display_name: "Dr. Okafor" },
    });
    // A 409 isn't retried.
    expect(ack).toHaveBeenCalledTimes(1);
  });

  it("dismisses with the reason and the note", async () => {
    const dismiss = vi.spyOn(holder.client, "dismissAlert");
    const { result } = renderHook(useNewList, { wrapper });
    await waitFor(() =>
      expect(result.current.list.data?.pages[0]?.alerts).toHaveLength(6),
    );
    act(() =>
      result.current.dismiss.mutate({
        id: "al-105",
        d: { reason: "already_known", note: "Known." },
      }),
    );
    await waitFor(() =>
      expect(
        result.current.list.data?.pages[0]?.alerts.find(
          (a) => a.id === "al-105",
        ),
      ).toMatchObject({ status: "dismissed", dismiss_reason: "already_known" }),
    );
    expect(dismiss).toHaveBeenCalledWith(
      "al-105",
      { reason: "already_known", note: "Known." },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("stops asking when alerts aren't switched on (R12)", async () => {
    expect(alertsOff(new ApiError(404, "not_found"))).toBe(true);
    expect(alertsOff(new ApiError(503, "error"))).toBe(false);
    const list = vi
      .spyOn(holder.client, "listAlerts")
      .mockRejectedValue(new ApiError(404, "not_found"));
    const { result } = renderHook(() => useAlertFeed(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // One check is two reads (the feed and the Criticals); neither is retried.
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("treats a 403 as an error, not as switched off, and re-checks slowly (F2)", () => {
    const forbidden = new ApiError(403, "forbidden");
    expect(alertsOff(forbidden)).toBe(false);
    expect(alertsRecheck(forbidden, 30_000)).toBe(ALERT_SLOW_MS);
    expect(ALERT_SLOW_MS).toBe(600_000);
    expect(alertsRecheck(new ApiError(404, "not_found"), 30_000)).toBe(false);
    expect(alertsRecheck(new ApiError(503, "error"), 30_000)).toBe(30_000);
    expect(alertsRecheck(null, 30_000)).toBe(30_000);
    // Offline stays offline, whatever the error.
    expect(alertsRecheck(forbidden, false)).toBe(false);
  });
});

describe("notification settings", () => {
  it("keeps pop-ups on until the settings load (R5), then follows them", async () => {
    let release!: () => void;
    vi.spyOn(holder.client, "getNotificationSettings").mockImplementation(
      () =>
        new Promise((r) => {
          release = () => r({ alert_popups: false, correction_popups: true });
        }),
    );
    const { result } = renderHook(() => usePopupSettings(), { wrapper });
    expect(result.current).toEqual(DEFAULT_SETTINGS);
    act(() => release());
    await waitFor(() => expect(result.current.alert_popups).toBe(false));
  });

  it("keeps pop-ups on when the settings can't load", async () => {
    vi.spyOn(holder.client, "getNotificationSettings").mockRejectedValue(
      new ApiError(400, "error"),
    );
    const { result } = renderHook(
      () => ({ s: useNotificationSettings(), p: usePopupSettings() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.s.isError).toBe(true));
    expect(result.current.p).toEqual(DEFAULT_SETTINGS);
  });

  it("saves each change with its own key and caches the answer", async () => {
    const update = vi.spyOn(holder.client, "updateNotificationSettings");
    const { result } = renderHook(
      () => ({
        s: useNotificationSettings(),
        save: useUpdateNotificationSettings(),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
    );
    act(() => result.current.save.mutate({ alert_popups: false }));
    await waitFor(() =>
      expect(result.current.s.data?.alert_popups).toBe(false),
    );
    act(() => result.current.save.mutate({ correction_popups: false }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(qc.getQueryData(NOTIFY_KEYS.settings)).toEqual({
        alert_popups: false,
        correction_popups: false,
      }),
    );
    expect(update.mock.calls[0]![1]?.idempotencyKey).not.toBe(
      update.mock.calls[1]![1]?.idempotencyKey,
    );
  });

  it("shows a change at once, before the server answers (B3)", async () => {
    let release!: () => void;
    const real = holder.client.updateNotificationSettings.bind(holder.client);
    vi.spyOn(holder.client, "updateNotificationSettings").mockImplementation(
      (p, o) =>
        new Promise((r) => {
          release = () => r(real(p, o));
        }),
    );
    const { result } = renderHook(
      () => ({
        s: useNotificationSettings(),
        save: useUpdateNotificationSettings(),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
    );
    act(() => result.current.save.mutate({ alert_popups: false }));
    await waitFor(() =>
      expect(result.current.s.data?.alert_popups).toBe(false),
    );
    expect(result.current.save.isPending).toBe(true);
    act(() => release());
    await waitFor(() => expect(result.current.save.isSuccess).toBe(true));
    expect(result.current.s.data?.alert_popups).toBe(false);
  });

  it("rolls the change back when the save fails (B3)", async () => {
    let fail!: () => void;
    vi.spyOn(holder.client, "updateNotificationSettings").mockImplementation(
      () =>
        new Promise((_, rej) => {
          fail = () => rej(new ApiError(400, "error"));
        }),
    );
    const { result } = renderHook(
      () => ({
        s: useNotificationSettings(),
        save: useUpdateNotificationSettings(),
      }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
    );
    act(() => result.current.save.mutate({ alert_popups: false }));
    await waitFor(() =>
      expect(result.current.s.data?.alert_popups).toBe(false),
    );
    act(() => fail());
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    await waitFor(() =>
      expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
    );
  });

  describe("overlapping saves", () => {
    const setup = () => {
      const calls: {
        patch: NotificationSettingsPatchIn;
        ok: () => void;
        fail: () => void;
      }[] = [];
      const real = holder.client.updateNotificationSettings.bind(holder.client);
      vi.spyOn(holder.client, "updateNotificationSettings").mockImplementation(
        (p, o) =>
          new Promise((resolve, reject) => {
            calls.push({
              patch: p,
              ok: () => resolve(real(p, o)),
              fail: () => reject(new ApiError(400, "error")),
            });
          }),
      );
      return calls;
    };
    const hooks = () =>
      renderHook(
        () => ({
          s: useNotificationSettings(),
          save: useUpdateNotificationSettings(),
        }),
        { wrapper },
      );

    it("keeps the later save's value when the earlier one answers first", async () => {
      const calls = setup();
      const { result } = hooks();
      await waitFor(() =>
        expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
      );
      act(() => result.current.save.mutate({ alert_popups: false }));
      act(() => result.current.save.mutate({ correction_popups: false }));
      await waitFor(() => expect(calls).toHaveLength(2));
      await act(async () => calls[0]!.ok());
      expect(qc.getQueryData(NOTIFY_KEYS.settings)).toEqual({
        alert_popups: false,
        correction_popups: false,
      });
      await act(async () => calls[1]!.ok());
      await waitFor(() =>
        expect(result.current.s.data).toEqual({
          alert_popups: false,
          correction_popups: false,
        }),
      );
    });

    it("doesn't wipe the later save's value when the earlier one fails", async () => {
      const calls = setup();
      const { result } = hooks();
      await waitFor(() =>
        expect(result.current.s.data).toEqual(DEFAULT_SETTINGS),
      );
      act(() => result.current.save.mutate({ alert_popups: false }));
      act(() => result.current.save.mutate({ correction_popups: false }));
      await waitFor(() => expect(calls).toHaveLength(2));
      await act(async () => calls[0]!.fail());
      expect(qc.getQueryData(NOTIFY_KEYS.settings)).toEqual({
        alert_popups: false,
        correction_popups: false,
      });
    });
  });

  it("falls back to both on when a save fails before the settings loaded (R5)", async () => {
    vi.spyOn(holder.client, "getNotificationSettings").mockImplementation(
      () => new Promise(() => {}),
    );
    let fail!: () => void;
    vi.spyOn(holder.client, "updateNotificationSettings").mockImplementation(
      () =>
        new Promise((_, rej) => {
          fail = () => rej(new ApiError(400, "error"));
        }),
    );
    const { result } = renderHook(
      () => ({ p: usePopupSettings(), save: useUpdateNotificationSettings() }),
      { wrapper },
    );
    act(() => result.current.save.mutate({ alert_popups: false }));
    await waitFor(() => expect(result.current.p.alert_popups).toBe(false));
    act(() => fail());
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    await waitFor(() => expect(result.current.p).toEqual(DEFAULT_SETTINGS));
  });
});
