import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "../ui/toast";

const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { NotificationBell } from "../notifications/notification-bell";
import { DecisionsProvider, newDecisions } from "./decisions-provider";

const reviewer = {
  display_name: "Dr. Bello",
  full_name: null,
  specialty: null,
  hospital: null,
};
const waiting = makeCorrection({ id: "c1" });
const approved: CorrectionOut = {
  ...waiting,
  status: "approved",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
};
const rejected: CorrectionOut = {
  ...makeCorrection({ id: "c2" }),
  status: "rejected",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
  rejection: { reason_code: "unsafe", note: "Dose too high." },
};

function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DecisionsProvider>
          <NotificationBell />
          <button>elsewhere</button>
        </DecisionsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const poll = (qc: QueryClient) =>
  act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));

const baseline = (qc: QueryClient) =>
  vi.waitFor(() =>
    expect(qc.getQueryState(CORRECTION_KEYS.mine)?.status).toBe("success"),
  );

beforeEach(() => listMine.mockReset());

describe("newDecisions", () => {
  const since = T0 - 60_000;
  it("treats the first look as a baseline", () => {
    expect(newDecisions(null, [approved], since, T0)).toEqual([]);
  });
  it("notes a waiting correction that was decided", () => {
    const prev = new Map([["c1", "pending_review" as const]]);
    expect(newDecisions(prev, [approved], since, T0)).toEqual([
      {
        id: "c1",
        status: "approved",
        title: "Dengue fever, likely",
        by: "Dr. Bello",
        reason: null,
        at: T0,
      },
    ]);
  });
  it("notes a new one only if it was decided after we started", () => {
    const prev = new Map<string, CorrectionOut["status"]>();
    expect(newDecisions(prev, [rejected], since, T0)[0]).toMatchObject({
      status: "rejected",
      reason: "Unsafe: Dose too high.",
    });
    const old = { ...rejected, decided_at: new Date(since - 1).toISOString() };
    expect(newDecisions(prev, [old], since, T0)).toEqual([]);
  });
  it("ignores withdrawals and unchanged decisions", () => {
    const prev = new Map([
      ["c1", "approved" as const],
      ["c3", "pending_review" as const],
    ]);
    const withdrawn = {
      ...makeCorrection({ id: "c3" }),
      status: "withdrawn" as const,
    };
    expect(newDecisions(prev, [approved, withdrawn], since, T0)).toEqual([]);
  });
});

describe("decision pop-ups and the bell", () => {
  it("never pops up decisions that were already there at sign-in", async () => {
    listMine.mockResolvedValue([approved]);
    const qc = ui();
    await baseline(qc);
    expect(
      await screen.findByRole("button", { name: "Notifications" }),
    ).toBeVisible();
    await act(() => Promise.resolve());
    expect(screen.queryByText("Your correction was approved")).toBeNull();
  });

  it("pops up a new decision, counts it on the bell, and lists it there", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValueOnce([waiting]);
    const qc = ui();
    await baseline(qc);
    listMine.mockResolvedValueOnce([approved]);
    await poll(qc);
    expect(
      await screen.findByText("Your correction was approved"),
    ).toBeVisible();
    expect(screen.getByText("Dengue fever, likely · Dr. Bello")).toBeVisible();
    const bell = screen.getByRole("button", {
      name: "Notifications, 1 unread",
    });
    await user.click(bell);
    const panel = screen.getByRole("region", { name: "Notifications" });
    expect(within(panel).getByText("Approved")).toBeVisible();
    expect(within(panel).getByText("Dengue fever, likely")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "See all" }),
    ).toHaveAttribute("href", "/notifications");
    expect(
      within(panel).getByText("Decisions are kept for this session only."),
    ).toBeVisible();
    expect(bell).toHaveAccessibleName("Notifications");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
    expect(bell).toHaveFocus();
  });

  it("shows the reviewer's reason for a rejection", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValueOnce([
      {
        ...rejected,
        status: "pending_review",
        rejection: null,
        decided_at: null,
        decided_by: null,
      },
    ]);
    const qc = ui();
    await baseline(qc);
    listMine.mockResolvedValueOnce([rejected]);
    await poll(qc);
    expect(
      await screen.findByText("Your correction was rejected"),
    ).toBeVisible();
    expect(
      screen.getByText("Dengue fever, likely · Reason: Unsafe: Dose too high."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /1 unread/ }));
    expect(
      within(screen.getByRole("region", { name: "Notifications" })).getByText(
        "Reason: Unsafe: Dose too high.",
      ),
    ).toBeVisible();
  });

  it("closes when you click elsewhere, and says when there's nothing yet", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([]);
    ui();
    await user.click(
      await screen.findByRole("button", { name: "Notifications" }),
    );
    expect(screen.getByText(/No decisions yet/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByRole("region", { name: "Notifications" })).toBeNull();
  });

  it("keeps the history in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    listMine.mockResolvedValueOnce([waiting]);
    const qc = ui();
    await baseline(qc);
    listMine.mockResolvedValueOnce([approved]);
    await poll(qc);
    await screen.findByText("Your correction was approved");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
