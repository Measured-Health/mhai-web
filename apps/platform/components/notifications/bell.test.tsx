import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { notificationOk } from "@/lib/analytics/read";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { NotificationBell } from "./bell";

const env = vi.hoisted(() => ({
  online: true,
  desktop: true,
  push: vi.fn(),
}));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => env.online }));
vi.mock("@mhai/ui/hooks/use-media", () => ({
  useIsDesktop: () => env.desktop,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics",
  useRouter: () => ({ push: env.push, replace: vi.fn() }),
}));

let api: PlatformClient;
let who = ADA.email;
function install(notifications: "normal" | "unavailable" = "normal") {
  api = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
    notifications,
  });
  __setPlatformClientForTests(api);
}
function setVisible(v: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => v,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}
beforeEach(() => {
  env.online = true;
  env.desktop = true;
  env.push.mockClear();
  who = ADA.email;
  install();
});
afterEach(() => {
  vi.useRealTimers();
  setVisible("visible");
  __resetPlatformClientForTests();
});

const bell = (name: string | RegExp = /^Notifications/) =>
  screen.findByRole("button", { name });
const list = () => screen.getByRole("list", { name: "New analytics changes" });

describe("the analytics bell", () => {
  it("the bell shows the count and its label", async () => {
    renderWithAuth(<NotificationBell />);
    const b = await bell("Notifications, 6 new");
    expect(b).toHaveTextContent("6");
  });

  it("is labelled just Notifications when there is nothing new", async () => {
    const seen = createMockPlatform({ delayMs: 0, me: () => who });
    __setPlatformClientForTests(seen);
    await seen.markSeen({}, { idempotencyKey: "k-all" });
    renderWithAuth(<NotificationBell />);
    expect(await bell("Notifications")).toBeInTheDocument();
  });

  it("opening the list shows newest first and marks them seen", async () => {
    const mark = vi.spyOn(api, "markSeen");
    renderWithAuth(<NotificationBell />);
    await userEvent.click(await bell("Notifications, 6 new"));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    const items = within(list()).getAllByRole("button");
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveAccessibleName(
      /Northgate General Hospital: Critical alerts acknowledged 2× slower/,
    );
    expect(items[1]).toHaveAccessibleName(/Low potassium alerts rising/);
    expect(
      within(dialog).getAllByText(/^Northgate General Hospital · \d/),
    ).not.toHaveLength(0);
    expect(within(dialog).getByText(/^All hospitals · \d/)).toBeInTheDocument();
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    const [body, opts] = mark.mock.calls[0]!;
    expect((body as { ids: string[] }).ids).toHaveLength(6);
    expect(opts.idempotencyKey).toBeTruthy();
    expect(await bell("Notifications")).toBeInTheDocument();
  });

  it("Mark all seen clears the count", async () => {
    // The open's own marking fails, so the count stays until the button.
    const mark = vi.spyOn(api, "markSeen");
    mark.mockRejectedValueOnce(new ApiError(400, "invalid"));
    renderWithAuth(<NotificationBell />);
    await userEvent.click(await bell("Notifications, 6 new"));
    await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "Notifications, 6 new" }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Mark all seen" }),
    );
    expect(mark).toHaveBeenCalledTimes(2);
    expect(mark.mock.calls[1]![0]).toEqual({});
    expect(await bell("Notifications")).toBeInTheDocument();
  });

  it("an item opens Analytics with that change selected", async () => {
    renderWithAuth(<NotificationBell />);
    await userEvent.click(await bell("Notifications, 6 new"));
    await userEvent.click(
      within(list()).getByRole("button", { name: /answers reviewed faster/ }),
    );
    expect(env.push).toHaveBeenCalledWith(
      "/analytics?change=chg_hav_review_time",
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Notifications" }),
      ).toBeNull(),
    );
  });

  it("a failed check keeps the last count; the list shows Couldn't load notifications with Try again", async () => {
    renderWithAuth(<NotificationBell />);
    const b = await bell("Notifications, 6 new");
    vi.spyOn(api, "listNotifications").mockRejectedValue(
      new ApiError(503, "unavailable"),
    );
    // A failed poll leaves the count and adds no error badge.
    await act(async () => {
      env.online = true;
      await vi.waitFor(() => {});
    });
    await userEvent.click(b);
    // Opening re-reads; the read fails.
    expect(
      await screen.findByText(/Couldn't load notifications/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Notifications, 6 new" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/couldn't check/i)).toBeNull();
  });

  it("shows Couldn't load notifications when the first read fails, and Try again reads again", async () => {
    install("unavailable");
    renderWithAuth(<NotificationBell />);
    await userEvent.click(await bell("Notifications"));
    expect(
      await screen.findByText(/Couldn't load notifications/),
    ).toBeInTheDocument();
    const read = vi.spyOn(api, "listNotifications");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(read).toHaveBeenCalled();
  });

  it("shows Nothing new when the list is empty", async () => {
    vi.spyOn(api, "listNotifications").mockResolvedValue({
      items: [],
      unseen: 0,
    });
    renderWithAuth(<NotificationBell />);
    await userEvent.click(await bell("Notifications"));
    expect(await screen.findByText("Nothing new")).toBeInTheDocument();
  });

  it("a list with a summary that fails the rule shows Couldn't load notifications", async () => {
    vi.spyOn(api, "listNotifications").mockResolvedValue({
      items: [
        {
          id: "ntf_x",
          change_id: "chg_x",
          hospital: { id: "h1", name: "Northgate General Hospital" },
          summary: "Northgate: fewer than 5 alerts, down 3 from 9 (60%)",
          serious: false,
          direction: "falling",
          at: "2026-10-22T09:00:00.000Z",
          seen: false,
        },
      ],
      unseen: 1,
    });
    renderWithAuth(<NotificationBell />);
    await userEvent.click(await bell("Notifications, 1 new"));
    expect(
      await screen.findByText(/Couldn't load notifications/),
    ).toBeInTheDocument();
  });

  it("no polling while the tab is hidden or offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi.spyOn(api, "listNotifications");
    setVisible("hidden");
    renderWithAuth(<NotificationBell />);
    await bell("Notifications, 6 new");
    expect(read).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(130_000));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => setVisible("visible"));
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not poll while offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi.spyOn(api, "listNotifications");
    env.online = false;
    renderWithAuth(<NotificationBell />);
    await bell("Notifications, 6 new");
    await act(() => vi.advanceTimersByTimeAsync(130_000));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("polls every minute while visible and online", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi.spyOn(api, "listNotifications");
    renderWithAuth(<NotificationBell />);
    await bell("Notifications, 6 new");
    await act(() => vi.advanceTimersByTimeAsync(61_000));
    expect(read.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("a phone opens the list as a sheet and focus returns to the bell", async () => {
    env.desktop = false;
    renderWithAuth(<NotificationBell />);
    const b = await bell("Notifications, 6 new");
    expect(b).toHaveClass("size-11");
    await userEvent.click(b);
    const sheet = await screen.findByRole("dialog", { name: "Notifications" });
    expect(sheet.tagName).toBe("SECTION");
    expect(sheet).toContainElement(list());
    await userEvent.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.queryByRole("list", { name: "New analytics changes" }),
      ).toBeNull(),
    );
    expect(await bell()).toHaveFocus();
  });

  it("an auditor has the bell too, and seen is per person", async () => {
    const view = renderWithAuth(<NotificationBell />, { user: AMARA });
    who = AMARA.email;
    expect(await bell("Notifications, 6 new")).toBeInTheDocument();
    view.unmount();
    await api.markSeen({}, { idempotencyKey: "k-amara" });
    who = ADA.email;
    renderWithAuth(<NotificationBell />);
    expect(await bell("Notifications, 6 new")).toBeInTheDocument();
  });
});

describe("notificationOk", () => {
  const base = {
    id: "ntf_a",
    change_id: "chg_a",
    hospital: null,
    serious: false,
    direction: "rising",
    at: "2026-10-22T09:00:00.000Z",
    seen: false,
  };
  it("accepts a plain summary and refuses a leaky one", () => {
    expect(
      notificationOk({
        ...base,
        summary: "All hospitals: rising (48 → 83 a week)",
      }),
    ).toBe(true);
    expect(
      notificationOk({ ...base, summary: "Fewer than 5 → 83 a week" }),
    ).toBe(true);
    expect(
      notificationOk({ ...base, summary: "Fewer than 5 → 83 (3 fewer)" }),
    ).toBe(false);
    expect(
      notificationOk({ ...base, summary: "Down 40% from fewer than 5" }),
    ).toBe(false);
    expect(notificationOk({ ...base, summary: "" })).toBe(false);
    expect(
      notificationOk({ ...base, summary: "x", direction: "sideways" }),
    ).toBe(false);
  });
});
