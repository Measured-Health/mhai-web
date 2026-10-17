import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { mockAlerts } from "@/tests/alerts";
import { renderWithAuth } from "@/tests/auth-wrapper";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/account",
}));
import { NotificationsSection, SAVED_MS } from "./notifications-section";

const ALERTS = "Pop-ups for patient alerts";
const DECISIONS = "Pop-ups for decisions on my corrections";
const sw = (name: string) => screen.findByRole("switch", { name });

beforeEach(() => {
  holder.client = mockAlerts();
});
afterEach(() => vi.restoreAllMocks());

describe("Notifications settings", () => {
  it("starts with both pop-ups on", async () => {
    renderWithAuth(<NotificationsSection />);
    expect(await sw(ALERTS)).toBeChecked();
    expect(await sw(DECISIONS)).toBeChecked();
    expect(
      screen.getByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  it("shows no switches while the settings load (R5)", async () => {
    let release: () => void = () => {};
    vi.spyOn(holder.client, "getNotificationSettings").mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ alert_popups: false, correction_popups: true });
        }),
    );
    renderWithAuth(<NotificationsSection />);
    expect(
      await screen.findByRole("region", { name: "Notifications" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    release();
    // The saved value shows, not a guessed one.
    expect(await sw(ALERTS)).not.toBeChecked();
  });

  it("says so and offers a retry when the settings can't load, with no enabled switches (R5)", async () => {
    const user = userEvent.setup();
    const get = vi
      .spyOn(holder.client, "getNotificationSettings")
      .mockRejectedValueOnce(new ApiError(400, "error"));
    renderWithAuth(<NotificationsSection />);
    expect(
      await screen.findByText("Couldn't load your notification settings"),
    ).toBeVisible();
    expect(screen.queryByRole("switch")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await sw(ALERTS)).toBeEnabled();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("turning alert pop-ups off saves it and says Critical alerts will still pop up (Review Focus 2)", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(ALERTS));
    expect(await sw(ALERTS)).not.toBeChecked();
    expect(
      screen.getByText("Critical alerts will still pop up."),
    ).toBeVisible();
    expect(await sw(ALERTS)).toHaveAccessibleDescription(
      "Critical alerts will still pop up.",
    );
    await waitFor(async () =>
      expect(await holder.client.getNotificationSettings()).toEqual({
        alert_popups: false,
        correction_popups: true,
      }),
    );
  });

  it("says Saved only after the save lands", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const real = holder.client.updateNotificationSettings.bind(holder.client);
    vi.spyOn(holder.client, "updateNotificationSettings").mockImplementation(
      async (p, o) => {
        await new Promise<void>((r) => (release = r));
        return real(p, o);
      },
    );
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(DECISIONS));
    // At once on screen, but not yet saved.
    expect(await sw(DECISIONS)).not.toBeChecked();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    release();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Saved"),
    );
  });

  it("lets Saved go after a few seconds (F17)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      renderWithAuth(<NotificationsSection />);
      await user.click(await sw(DECISIONS));
      await waitFor(() =>
        expect(screen.getByRole("status")).toHaveTextContent("Saved"),
      );
      act(() => vi.advanceTimersByTime(SAVED_MS));
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports an earlier save that failed while a later one landed (F17)", async () => {
    const user = userEvent.setup();
    const real = holder.client.updateNotificationSettings.bind(holder.client);
    let failFirst: () => void = () => {};
    let second: Promise<unknown> | undefined;
    const update = vi
      .spyOn(holder.client, "updateNotificationSettings")
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            failFirst = () => reject(new ApiError(400, "error"));
          }),
      )
      .mockImplementation((p, o) => (second = real(p, o)));
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(ALERTS));
    await user.click(await sw(DECISIONS));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    // The later save lands first; then the earlier one fails.
    await act(() => second);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => failFirst());
    const banner = await screen.findByRole("alert");
    expect(banner).toHaveTextContent(
      "Couldn't save your notification settings",
    );
  });

  it("says the settings follow you to any device", async () => {
    renderWithAuth(<NotificationsSection />);
    await sw(ALERTS);
    expect(
      screen.getByText(
        "Kept with your account, so they follow you to any device.",
      ),
    ).toBeVisible();
  });

  it("sends one idempotency key per change", async () => {
    const user = userEvent.setup();
    const update = vi.spyOn(holder.client, "updateNotificationSettings");
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(DECISIONS));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    await waitFor(async () => expect(await sw(DECISIONS)).not.toBeChecked());
    await user.click(await sw(DECISIONS));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[0]![0]).toEqual({ correction_popups: false });
    expect(update.mock.calls[1]![0]).toEqual({ correction_popups: true });
    expect(update.mock.calls[0]![1]?.idempotencyKey).not.toBe(
      update.mock.calls[1]![1]?.idempotencyKey,
    );
  });

  it("puts the switch back and says so when saving fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "updateNotificationSettings").mockRejectedValue(
      new ApiError(400, "error"),
    );
    renderWithAuth(<NotificationsSection />);
    await user.click(await sw(ALERTS));
    // Announced: the banner is an alert (F17).
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't save your notification settings",
    );
    await waitFor(async () => expect(await sw(ALERTS)).toBeChecked());
    expect(screen.getByRole("status")).not.toHaveTextContent("Saved");
  });

  it("can't be changed offline, and says why", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(<NotificationsSection />);
    const s = await sw(ALERTS);
    expect(s).toBeDisabled();
    expect(s).toHaveAccessibleDescription(
      /You're offline\. Changes need a connection\./,
    );
  });
});
