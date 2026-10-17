import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { useQueryClient } from "@tanstack/react-query";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { makeCorrection } from "@/tests/corrections";
import type { CorrectionOut } from "@/lib/api/contract";
import type { MockAlerts } from "@/lib/api/mock-alerts";
import { MOCK_ALERT_EVERY_MS, createMockAlerts } from "@/lib/api/mock-alerts";
import { ALERT_NOW, mockAlerts } from "@/tests/alerts";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";

const holder = vi.hoisted(() => ({ client: null as unknown as MockAlerts }));
vi.mock("@/lib/api/alerts", () => ({ getAlertsClient: () => holder.client }));
const push = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/notifications",
}));
const listMine = vi.hoisted(() =>
  vi.fn(async (): Promise<CorrectionOut[]> => []),
);
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
import ClinicianLayout from "@/app/(clinical)/(clinician)/layout";
import NotificationsPage from "@/app/(clinical)/(clinician)/notifications/page";
import { DecisionsProvider } from "../corrections/decisions-provider";
import { AlertsProvider, useAlerts } from "./alerts-provider";

const list = () => screen.findByRole("list", { name: "Patient alerts" });
const cards = async () => within(await list()).getAllByRole("article");
const shows = (n: number) =>
  waitFor(async () => expect(await cards()).toHaveLength(n));

beforeEach(() => {
  holder.client = mockAlerts();
  push.mockClear();
  replace.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Shows what the page still has to focus, so a test can see it cleared. */
function Probe() {
  const a = useAlerts();
  return <p data-testid="focus">{a?.focusId ?? "none"}</p>;
}
function Opener({ id }: { id: string }) {
  const a = useAlerts();
  return (
    <button type="button" onClick={() => a?.openAlert(id)}>
      open {id}
    </button>
  );
}
const withAlerts = (id: string) => (
  <ToastProvider>
    <AlertsProvider>
      <Opener id={id} />
      <Probe />
      <NotificationsPage />
    </AlertsProvider>
  </ToastProvider>
);

describe("Notifications: Patient alerts", () => {
  it("lists new alerts newest first, with the source when there are two systems", async () => {
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    const all = await cards();
    expect(all[0]).toHaveTextContent("Maryam Abdullahi");
    expect(all[5]).toHaveTextContent("Blessing Uche");
    expect(within(all[1]!).getByText("Results system")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Notifications", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Patient alerts" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Corrections" })).toHaveAttribute(
      "href",
      "/notifications/corrections",
    );
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("6 alerts shown")).toBeInTheDocument();
  });

  it("filters by status, severity and source", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    await user.click(screen.getByRole("button", { name: "Handled" }));
    await shows(1);
    expect(within(await list()).getByText("Kemi Afolabi")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Dismissed" }));
    await waitFor(async () =>
      expect(within(await list()).getByText("Peter Ogbu")).toBeVisible(),
    );
    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("button", { name: "Critical" }));
    await shows(2);
    const sources = screen.getByRole("group", { name: "Source" });
    await user.click(
      within(sources).getByRole("button", { name: "Main record" }),
    );
    await shows(1);
    expect(within(await list()).getByText("Maryam Abdullahi")).toBeVisible();
  });

  it("shows more with the cursor", async () => {
    const user = userEvent.setup();
    let t = ALERT_NOW;
    holder.client = createMockAlerts({
      now: () => t,
      me: async () => "Dr. Reyes",
      delayMs: 0,
    });
    t += 40 * MOCK_ALERT_EVERY_MS;
    renderWithAuth(<NotificationsPage />);
    await shows(20);
    await user.click(screen.getByRole("button", { name: "Show more alerts" }));
    await shows(36);
    expect(
      screen.queryByRole("button", { name: "Show more alerts" }),
    ).toBeNull();
    expect(screen.getByText("36 alerts shown")).toBeInTheDocument();
  });

  it("opens the alert a pop-up asked for, from New, and focuses it", async () => {
    const user = userEvent.setup();
    function Opener() {
      const a = useAlerts();
      return (
        <button type="button" onClick={() => a?.openAlert("al-105")}>
          open Samuel
        </button>
      );
    }
    renderWithAuth(
      <ToastProvider>
        <AlertsProvider>
          <Opener />
          <NotificationsPage />
        </AlertsProvider>
      </ToastProvider>,
    );
    await shows(6);
    await user.click(screen.getByRole("button", { name: "Dismissed" }));
    await shows(1);
    await user.click(screen.getByRole("button", { name: "open Samuel" }));
    expect(push).toHaveBeenCalledWith("/notifications");
    await waitFor(() =>
      expect(
        screen.getByRole("article", { name: /Samuel Bassey/ }),
      ).toHaveFocus(),
    );
    expect(screen.getByRole("button", { name: "New" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("says when alerts aren't switched on (R12, 404)", async () => {
    vi.spyOn(holder.client, "listAlerts").mockRejectedValue(
      new ApiError(404, "off"),
    );
    renderWithAuth(<NotificationsPage />);
    expect(
      await screen.findByText(
        "Patient alerts aren't switched on for your hospital yet",
      ),
    ).toBeVisible();
  });

  it("reads a 403 as couldn't load, never as switched off (F2)", async () => {
    vi.spyOn(holder.client, "listAlerts").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    renderWithAuth(<NotificationsPage />);
    expect(
      await screen.findByText("Couldn't load patient alerts"),
    ).toBeVisible();
    expect(screen.queryByText(/aren't switched on/)).toBeNull();
  });

  it("offers a retry when the alerts can't load", async () => {
    vi.spyOn(holder.client, "listAlerts")
      .mockRejectedValueOnce(new ApiError(400, "error"))
      .mockResolvedValue({ alerts: [], next_cursor: null, sources: [] });
    const user = userEvent.setup();
    renderWithAuth(<NotificationsPage />);
    expect(
      await screen.findByText("Couldn't load patient alerts"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No new patient alerts/)).toBeVisible();
  });

  it("never reads a failing list as no alerts", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(holder.client, "listAlerts").mockRejectedValue(
      new ApiError(500, "error"),
    );
    renderWithAuth(<NotificationsPage />);
    // Let the 5xx retries run out.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(
      await screen.findByText("Couldn't load patient alerts"),
    ).toBeVisible();
    expect(screen.queryByText(/No new patient alerts/)).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("shows the skeleton, not the empty text, while loading", async () => {
    vi.spyOn(holder.client, "listAlerts").mockReturnValue(
      new Promise(() => {}),
    );
    renderWithAuth(<NotificationsPage />);
    expect(
      await screen.findByText("Loading patient alerts"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No new patient alerts/)).toBeNull();
  });

  it("offers no print or export, and keeps alerts off a print-out (R14)", async () => {
    renderWithAuth(<NotificationsPage />);
    const l = await list();
    expect(
      screen.queryByRole("button", { name: /print|export|copy|download/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /print|export|download/i }),
    ).toBeNull();
    expect(l.closest(".print\\:hidden")).not.toBeNull();
    expect(screen.getByText("Patient alerts aren't printed.")).toHaveClass(
      "print:block",
    );
  });

  it("keeps alerts out of storage", async () => {
    const user = userEvent.setup();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    await user.click(screen.getByRole("button", { name: "Handled" }));
    await shows(1);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("dims and locks the old list while a filter change loads", async () => {
    const user = userEvent.setup();
    renderWithAuth(<NotificationsPage />);
    await shows(6);
    vi.spyOn(holder.client, "listAlerts").mockReturnValue(
      new Promise(() => {}),
    );
    await user.click(screen.getByRole("button", { name: "Handled" }));
    const l = await list();
    await waitFor(() => expect(l).toHaveAttribute("inert"));
    expect(l).toHaveClass("opacity-60");
    expect(screen.getByText("Updating alerts")).toBeInTheDocument();
    expect(screen.queryByText("6 alerts shown")).toBeNull();
  });

  it("shows the tab counts for alerts and decisions", async () => {
    const decided = {
      ...makeCorrection({ id: "c1" }),
      status: "approved" as const,
      decided_by: {
        display_name: "Dr. Bello",
        full_name: null,
        specialty: null,
        hospital: null,
      },
      decided_at: new Date().toISOString(),
    };
    let decide = false;
    listMine.mockImplementation(async () => [
      decide ? decided : makeCorrection({ id: "c1" }),
    ]);
    function Refresh() {
      const qc = useQueryClient();
      return (
        <button
          type="button"
          onClick={() => {
            decide = true;
            void qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine });
          }}
        >
          refresh decisions
        </button>
      );
    }
    const user = userEvent.setup();
    renderWithAuth(
      <ToastProvider>
        <DecisionsProvider>
          <AlertsProvider>
            <Refresh />
            <NotificationsPage />
          </AlertsProvider>
        </DecisionsProvider>
      </ToastProvider>,
    );
    expect(
      await screen.findByRole("link", { name: "Patient alerts · 6 new" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Corrections" })).toBeVisible();
    await waitFor(() => expect(listMine).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "refresh decisions" }));
    expect(
      await screen.findByRole("link", { name: "Corrections · 1 new" }),
    ).toBeVisible();
  });

  it("clears the request for an alert that isn't in the list", async () => {
    const user = userEvent.setup();
    renderWithAuth(withAlerts("al-missing"));
    await shows(6);
    await user.click(screen.getByRole("button", { name: "open al-missing" }));
    expect(push).toHaveBeenCalledWith("/notifications");
    await waitFor(() =>
      expect(screen.getByTestId("focus")).toHaveTextContent("none"),
    );
  });

  it("clears the request when the list can't load", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "listAlerts").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    renderWithAuth(withAlerts("al-105"));
    expect(
      await screen.findByText("Couldn't load patient alerts"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "open al-105" }));
    await waitFor(() =>
      expect(screen.getByTestId("focus")).toHaveTextContent("none"),
    );
  });

  it("scrolls to the alert without animating", async () => {
    const user = userEvent.setup();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      renderWithAuth(withAlerts("al-105"));
      await shows(6);
      await user.click(screen.getByRole("button", { name: "Dismissed" }));
      await shows(1);
      await user.click(screen.getByRole("button", { name: "open al-105" }));
      await waitFor(() =>
        expect(scroll).toHaveBeenCalledWith({
          block: "center",
          behavior: "auto",
        }),
      );
    } finally {
      // jsdom has no scrollIntoView of its own.
      // @ts-expect-error restoring the missing method
      delete Element.prototype.scrollIntoView;
    }
  });

  it("sends an admin-only person home without loading alerts", async () => {
    const listSpy = vi.spyOn(holder.client, "listAlerts");
    renderWithAuth(
      <ClinicianLayout params={Promise.resolve({})}>
        <NotificationsPage />
      </ClinicianLayout>,
      { ...TEST_USER, roles: ["hospital_admin"] },
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin/staff"));
    expect(screen.queryByRole("list", { name: "Patient alerts" })).toBeNull();
    expect(listSpy).not.toHaveBeenCalled();
  });
});
