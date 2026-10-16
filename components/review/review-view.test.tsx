import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import { REVIEW_POLL_MS } from "@/lib/correction-queries";
import { UNDO_WINDOW_MS } from "@/lib/corrections";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/review",
}));
import { ReviewView } from "./review-view";

const ui = () =>
  renderWithAuth(
    <ToastProvider>
      <input aria-label="Somewhere else" />
      <ReviewView />
    </ToastProvider>,
  );
const heading = (name: string) =>
  screen.findByRole("heading", { name, level: 2 });
const queue = () => screen.findByRole("list", { name: "Waiting corrections" });
const typing = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const offline = () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => void window.dispatchEvent(new Event("offline")));
};
const approveButton = () =>
  screen.getByRole("button", { name: "Approve correction" });
const notice = () => screen.queryByText("Correction approved");
/** Notes if "decided elsewhere" ever shows, even for a moment. */
function watchForGone() {
  let seen = false;
  const look = (n: Node) => {
    if (n.textContent?.includes("already decided")) seen = true;
  };
  const watch = new MutationObserver((records) =>
    records.forEach((r) => r.addedNodes.forEach(look)),
  );
  watch.observe(document.body, { childList: true, subtree: true });
  return () => {
    look(document.body);
    watch.disconnect();
    return seen;
  };
}
/** The server decides at once; its answer waits until you call `answer`. */
function holdAnswer<K extends "rejectCorrection" | "withdrawCorrection">(
  name: K,
) {
  const c = holder.client;
  const real = c[name].bind(c) as (...a: unknown[]) => Promise<unknown>;
  const gate = { answer: () => {} };
  vi.spyOn(c, name).mockImplementation((async (...args: unknown[]) => {
    const out = await real(...args);
    await new Promise<void>((r) => (gate.answer = r));
    return out;
  }) as never);
  return gate;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  holder.client = createMockClient();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // TanStack's onlineManager heard any "offline": tell it we're back.
  act(() => void window.dispatchEvent(new Event("online")));
});

describe("ReviewView", () => {
  it("lists the queue oldest first, flags over 4 hours and marks your own", async () => {
    ui();
    expect(
      await screen.findByRole("button", { name: "Waiting · 4" }),
    ).toHaveAttribute("aria-pressed", "true");
    const rows = within(await queue()).getAllByRole("button");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Acute asthma, moderate");
    expect(rows[0]).toHaveTextContent("Over 4 h");
    expect(rows[1]).toHaveTextContent("Febrile seizure, simple");
    expect(rows[1]).toHaveTextContent("Your correction");
    expect(rows[1]).toHaveTextContent("Over 4 h");
    expect(rows[2]).toHaveTextContent("Hypokalaemia, cause unclear");
    expect(rows[2]).not.toHaveTextContent("Over 4 h");
    expect(rows[3]).toHaveTextContent("Dengue fever, likely");
  });

  it("opens on the oldest one you can decide, with the compare view", async () => {
    ui();
    expect(await heading("Acute asthma, moderate")).toBeVisible();
    expect(
      screen
        .getByRole("region", { name: "What the system said" })
        .querySelector("del"),
    ).toHaveTextContent("moderate");
    expect(screen.getByText("Dr. Chidi Okafor")).toBeVisible();
  });

  it("approve: the undo notice for 60 seconds, then the next one loads (W20)", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    expect(screen.getByText("Correction approved")).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo approval" })).toHaveFocus();
    // The notice takes the detail's place; the next one waits for the window.
    expect(
      screen.queryByRole("heading", { name: "Acute asthma, moderate" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Hypokalaemia, cause unclear" }),
    ).toBeNull();
    expect(
      within(await queue()).queryByText("Acute asthma, moderate"),
    ).toBeNull();
    expect(approve).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[0]).toBe("c-asthma");
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    await waitFor(() => expect(notice()).toBeNull());
    expect(
      within(await queue()).queryByText("Acute asthma, moderate"),
    ).toBeNull();
  });

  it("Next correction on the notice sends it now and loads the next one", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.click(screen.getByRole("button", { name: "Next correction" }));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    expect(notice()).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("opening another row during the undo window confirms the approval", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.click(
      within(await queue()).getByRole("button", {
        name: /Dengue fever, likely/,
      }),
    );
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[0]).toBe("c-asthma");
    expect(await heading("Dengue fever, likely")).toBeVisible();
    expect(notice()).toBeNull();
  });

  it("A again while the notice is up does nothing to the unseen next one", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.keyboard("a");
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeVisible();
    expect(screen.getByText(/Acute asthma, moderate\./)).toBeVisible();
  });

  it("R while the notice is up opens nothing and sends nothing", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.keyboard("r");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeVisible();
  });

  it("on phones, A does nothing while the list is showing", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      })),
    );
    const user = typing();
    ui();
    await queue();
    await user.keyboard("a");
    expect(notice()).toBeNull();
    await user.click(
      within(await queue()).getByRole("button", {
        name: /Acute asthma, moderate/,
      }),
    );
    await user.keyboard("a");
    expect(screen.getByText("Correction approved")).toBeVisible();
  });

  it("a failed send after you moved on leaves you where you are", async () => {
    const user = typing();
    // Still failing after its retries.
    vi.spyOn(holder.client, "approveCorrection").mockRejectedValue(
      new ApiError(500, "server"),
    );
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.click(screen.getByRole("button", { name: "Next correction" }));
    // Two retries, about 2 s and 4 s apart at most; the toast stays 8 s.
    await act(() => vi.advanceTimersByTimeAsync(6_000));
    expect(await screen.findByText("Your approval wasn't sent")).toBeVisible();
    expect(
      screen.getByText(/Acute asthma, moderate is back in the queue/),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "Hypokalaemia, cause unclear",
        level: 2,
      }),
    ).toBeVisible();
    expect(
      within(await queue()).getByText("Acute asthma, moderate"),
    ).toBeVisible();
  });

  it("undo brings it back, sends nothing, and returns focus to Approve", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.click(screen.getByRole("button", { name: "Undo approval" }));
    expect(await heading("Acute asthma, moderate")).toBeVisible();
    await waitFor(() => expect(approveButton()).toHaveFocus());
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(approve).not.toHaveBeenCalled();
  });

  it("while an approval is being sent, Approve on the next one waits", async () => {
    const user = typing();
    let finish = () => {};
    vi.spyOn(holder.client, "approveCorrection").mockImplementationOnce(
      () => new Promise<void>((r) => (finish = r)),
    );
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    expect(approveButton()).toBeDisabled();
    await user.keyboard("a");
    expect(notice()).toBeNull();
    await act(async () => finish());
    await waitFor(() => expect(approveButton()).toBeEnabled());
  });

  it("A approves and R opens reject, but not while typing or in a dialog", async () => {
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByLabelText("Somewhere else"));
    await user.keyboard("ar");
    expect(notice()).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(
      screen.getByRole("heading", { name: "Acute asthma, moderate", level: 2 }),
    );
    await user.keyboard("r");
    expect(
      screen.getByRole("dialog", { name: "Why are you rejecting this?" }),
    ).toBeVisible();
    await user.keyboard("a");
    expect(notice()).toBeNull();
    await user.keyboard("{Escape}");
    await user.keyboard("a");
    expect(screen.getByText("Correction approved")).toBeVisible();
  });

  it("reject needs a reason, tells you the suggester sees it, then moves on", async () => {
    const user = typing();
    const reject = vi.spyOn(holder.client, "rejectCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    expect(
      within(dialog).getByText("Dr. Okafor will see your reason."),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(within(dialog).getByText("✕ Choose a reason.")).toBeVisible();
    await user.click(
      within(dialog).getByRole("radio", {
        name: "Not supported by guidelines",
      }),
    );
    await user.type(
      within(dialog).getByLabelText("Note (optional)"),
      "BTS says moderate at 92%.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(await screen.findByText("Correction rejected")).toBeVisible();
    expect(screen.getByText("Dr. Okafor will see your reason.")).toBeVisible();
    expect(reject).toHaveBeenCalledWith(
      "c-asthma",
      { reason_code: "not_supported", note: "BTS says moderate at 92%." },
      { idempotencyKey: expect.any(String) },
    );
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
  });

  it("your own reject never shows as decided elsewhere, even if the list refreshes first", async () => {
    const user = typing();
    const gate = holdAnswer("rejectCorrection");
    ui();
    await heading("Acute asthma, moderate");
    const seenGone = watchForGone();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    await user.click(within(dialog).getByRole("radio", { name: "Unsafe" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    // The queue refreshes before the answer arrives: it has left the list.
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Waiting corrections" }),
        ).queryByText("Acute asthma, moderate"),
      ).toBeNull(),
    );
    act(() => gate.answer());
    expect(await screen.findByText("Correction rejected")).toBeVisible();
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    expect(seenGone()).toBe(false);
  });

  it("your own withdraw never shows as decided elsewhere, even if the list refreshes first", async () => {
    const user = typing();
    const gate = holdAnswer("withdrawCorrection");
    ui();
    await user.click(
      await within(await queue()).findByRole("button", {
        name: /Febrile seizure, simple/,
      }),
    );
    expect(await heading("Febrile seizure, simple")).toBeVisible();
    const seenGone = watchForGone();
    await user.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Withdraw this correction?" }),
      ).getByRole("button", { name: "Withdraw" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Waiting corrections" }),
        ).queryByText("Febrile seizure, simple"),
      ).toBeNull(),
    );
    act(() => gate.answer());
    expect(await screen.findByText("Correction withdrawn")).toBeVisible();
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    expect(seenGone()).toBe(false);
  });

  it("your own: Approve and Reject disabled with the reason; withdraw instead", async () => {
    const user = typing();
    ui();
    await user.click(
      await within(await queue()).findByRole("button", {
        name: /Febrile seizure, simple/,
      }),
    );
    expect(await heading("Febrile seizure, simple")).toBeVisible();
    expect(approveButton()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(
      screen.getByText(/You can't review your own correction/),
    ).toBeVisible();
    await user.keyboard("a");
    expect(notice()).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw this correction?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Keep it" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("Correction withdrawn")).toBeVisible();
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Waiting corrections" }),
        ).queryByText("Febrile seizure, simple"),
      ).toBeNull(),
    );
    // The one after it opens next.
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
  });

  it("withdraw sends a waiting approval first", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await user.click(
      within(await queue()).getByRole("button", {
        name: /Febrile seizure, simple/,
      }),
    );
    expect(approve).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Withdraw this correction?" }),
      ).getByRole("button", { name: "Withdraw" }),
    );
    expect(await screen.findByText("Correction withdrawn")).toBeVisible();
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("the withdraw dialog can't send once the connection drops", async () => {
    const user = typing();
    const withdraw = vi.spyOn(holder.client, "withdrawCorrection");
    ui();
    await user.click(
      await within(await queue()).findByRole("button", {
        name: /Febrile seizure, simple/,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw this correction?",
    });
    offline();
    expect(
      within(dialog).getByRole("button", { name: "Withdraw" }),
    ).toBeDisabled();
    expect(within(dialog).getByText(/You're offline/)).toBeVisible();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("a 403 from the API turns it into your own (Review Focus 4)", async () => {
    const user = typing();
    vi.spyOn(holder.client, "approveCorrection").mockRejectedValueOnce(
      new ApiError(403, "self_approval"),
    );
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(
      await screen.findByText("This is your own correction"),
    ).toBeVisible();
    await user.click(
      within(await queue()).getByRole("button", {
        name: /Acute asthma, moderate/,
      }),
    );
    expect(await heading("Acute asthma, moderate")).toBeVisible();
    expect(approveButton()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    ).toBeVisible();
  });

  it("someone else decides it while you're rejecting (Review Focus 1)", async () => {
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    await user.type(
      within(dialog).getByLabelText("Note (optional)"),
      "Half written",
    );
    // Another clinician decides it elsewhere; the next poll drops it.
    await holder.client.approveCorrection("c-asthma");
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    expect(
      await within(dialog).findByText(
        "Another clinician has already decided this correction",
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Note (optional)")).toHaveValue(
      "Half written",
    );
    expect(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "Acute asthma, moderate", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next correction" }));
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
  });

  it("a 409 on sending the rejection: the same notice, and sending stops (W6)", async () => {
    const user = typing();
    const reject = vi
      .spyOn(holder.client, "rejectCorrection")
      .mockRejectedValueOnce(new ApiError(409, "already_decided"));
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    await user.click(within(dialog).getByRole("radio", { name: "Unsafe" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(
      await within(dialog).findByText(
        "Another clinician has already decided this correction",
      ),
    ).toBeVisible();
    expect(within(dialog).queryByText(/decided this one first/)).toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    // The detail stays, with the same notice; the queue drops it.
    expect(
      screen.getByRole("heading", { name: "Acute asthma, moderate", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    expect(approveButton()).toBeDisabled();
    expect(
      within(await queue()).queryByText("Acute asthma, moderate"),
    ).toBeNull();
    expect(reject).toHaveBeenCalledTimes(1);
  });

  it("offline: decisions are disabled and A does nothing (Review Focus 3)", async () => {
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    offline();
    expect(screen.getByText("You're offline")).toBeVisible();
    expect(approveButton()).toBeDisabled();
    await user.keyboard("a");
    expect(notice()).toBeNull();
  });

  it("an approval waiting when the connection drops comes back (Review Focus 3)", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    offline();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).not.toHaveBeenCalled();
    expect(await screen.findByText("Your approval wasn't sent")).toBeVisible();
    expect(
      within(await queue()).getByText("Acute asthma, moderate"),
    ).toBeVisible();
    // Back in the detail too, where you left it.
    expect(await heading("Acute asthma, moderate")).toBeVisible();
  });

  it("changing the filter reselects, and A acts only on what's shown (W7)", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "My specialty" }));
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    await user.keyboard("a");
    expect(screen.getByText("Correction approved")).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[0]).toBe("c-potassium");
  });

  it("the last one decided elsewhere stays on screen until you move on (W8)", async () => {
    const user = typing();
    const c = holder.client;
    await c.approveCorrection("c-potassium");
    await c.rejectCorrection("c-dengue", { reason_code: "unsafe" });
    await c.withdrawCorrection("c-seizure");
    ui();
    await heading("Acute asthma, moderate");
    await c.approveCorrection("c-asthma");
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    expect(
      await screen.findByText(
        "Another clinician has already decided this correction",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Acute asthma, moderate", level: 2 }),
    ).toBeVisible();
    expect(screen.queryByRole("heading", { name: "All caught up" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next correction" }));
    expect(await heading("All caught up")).toBeVisible();
  });

  it("all caught up, with your recent decisions, when nothing is waiting", async () => {
    const c = holder.client;
    await c.approveCorrection("c-asthma");
    await c.approveCorrection("c-potassium");
    await c.rejectCorrection("c-dengue", { reason_code: "unsafe" });
    await c.withdrawCorrection("c-seizure");
    ui();
    expect(await heading("All caught up")).toBeVisible();
    const recent = await screen.findByRole("list", {
      name: "Your recent decisions",
    });
    expect(recent).toHaveTextContent("Dengue fever, likely");
    expect(recent).toHaveTextContent("Rejected");
  });

  it("filters to your specialty, and shows your decisions under Done", async () => {
    const user = typing();
    ui();
    await user.click(
      await screen.findByRole("button", { name: "My specialty" }),
    );
    expect(
      screen.getByRole("button", { name: "My specialty" }),
    ).toHaveAttribute("aria-pressed", "true");
    const rows = within(await queue()).getAllByRole("button");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Hypokalaemia, cause unclear");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByRole("list", { name: "Your recent decisions" }),
    ).toHaveTextContent("Warfarin over-anticoagulation");
  });

  it("says when reviewing isn't available for your account (R3)", async () => {
    vi.spyOn(holder.client, "listPendingCorrections").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    ui();
    expect(
      await screen.findByText(
        "Reviewing corrections isn't available for your account",
      ),
    ).toBeVisible();
  });

  it("keeps everything in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    await user.click(approveButton());
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(setItem).not.toHaveBeenCalled();
  });
});
