import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthTestProvider } from "@/tests/auth-wrapper";

const api = vi.hoisted(() => ({
  listPendingCorrections: vi.fn(),
  listMyCorrections: vi.fn(),
  listMyReviews: vi.fn(),
  getMyFeedbackStats: vi.fn(),
  rejectCorrection: vi.fn(),
  withdrawCorrection: vi.fn(),
  approveCorrection: vi.fn(),
  sendFeedback: vi.fn(),
}));
vi.mock("./api/client", () => ({ getClient: () => api }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { ApiError } from "./api/errors";
import {
  CORRECTION_KEYS,
  REVIEW_POLL_MS,
  useMyCorrections,
  usePendingCorrections,
  useRejectCorrection,
  useReviewBadge,
  useWithdrawCorrection,
} from "./correction-queries";
import { OutboxProvider } from "./offline/outbox-context";
import { useFeedback } from "./queries";

const wrap = () => {
  const qc = new QueryClient();
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
};
const setOnline = (on: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(on);
  act(() => void window.dispatchEvent(new Event(on ? "online" : "offline")));
};

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.listPendingCorrections.mockResolvedValue([]);
  api.listMyCorrections.mockResolvedValue([]);
});
afterEach(() => {
  // TanStack's online manager is global: tell it we are back online.
  setOnline(true);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("correction queries", () => {
  it("polls the queue every minute online, and not at all offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => usePendingCorrections(), { wrapper: wrap().wrapper });
    await waitFor(() =>
      expect(api.listPendingCorrections).toHaveBeenCalledTimes(1),
    );
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    expect(api.listPendingCorrections).toHaveBeenCalledTimes(2);
    setOnline(false);
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS * 3));
    expect(api.listPendingCorrections).toHaveBeenCalledTimes(2);
  });

  it("polls your own corrections more often, for decisions", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useMyCorrections(), { wrapper: wrap().wrapper });
    await waitFor(() => expect(api.listMyCorrections).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(api.listMyCorrections).toHaveBeenCalledTimes(2);
  });

  it("counts others' waiting corrections for the badge", async () => {
    api.listPendingCorrections.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const { result } = renderHook(() => useReviewBadge(), {
      wrapper: wrap().wrapper,
    });
    expect(result.current).toEqual({ count: null, forbidden: false });
    await waitFor(() =>
      expect(result.current).toEqual({ count: 2, forbidden: false }),
    );
  });

  it("says forbidden on a 403, without retrying or polling again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.listPendingCorrections.mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    const { result } = renderHook(() => useReviewBadge(), {
      wrapper: wrap().wrapper,
    });
    await waitFor(() => expect(result.current.forbidden).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS * 3));
    expect(api.listPendingCorrections).toHaveBeenCalledTimes(1);
  });

  it("rejects with one key across a retry, then refreshes the lists", async () => {
    api.rejectCorrection
      .mockRejectedValueOnce(new ApiError(503, "unavailable"))
      .mockResolvedValueOnce(undefined);
    const { qc, wrapper } = wrap();
    const refresh = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRejectCorrection(), { wrapper });
    act(() =>
      result.current.mutate({ id: "c1", r: { reason_code: "unsafe" } }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = api.rejectCorrection.mock.calls.map(
      (c) => (c[2] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(api.rejectCorrection.mock.calls[0]?.slice(0, 2)).toEqual([
      "c1",
      { reason_code: "unsafe" },
    ]);
    expect(refresh).toHaveBeenCalledWith({ queryKey: CORRECTION_KEYS.all });
    expect(refresh).toHaveBeenCalledWith({ queryKey: CORRECTION_KEYS.stats });
  });

  it("uses a new key for each withdraw, and never retries offline", async () => {
    api.withdrawCorrection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWithdrawCorrection(), {
      wrapper: wrap().wrapper,
    });
    act(() => result.current.mutate({ id: "c1" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => result.current.mutate({ id: "c1" }));
    await waitFor(() =>
      expect(api.withdrawCorrection).toHaveBeenCalledTimes(2),
    );
    const [k1, k2] = api.withdrawCorrection.mock.calls.map(
      (c) => (c[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(k1).not.toBe(k2);

    setOnline(false);
    api.withdrawCorrection.mockReset();
    api.withdrawCorrection.mockRejectedValue(new ApiError(0, "network"));
    act(() => result.current.mutate({ id: "c2" }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.withdrawCorrection).toHaveBeenCalledTimes(1);
  });

  it("a decision's own callbacks don't wait for the lists to refresh", async () => {
    api.rejectCorrection.mockResolvedValue(undefined);
    api.withdrawCorrection.mockResolvedValue(undefined);
    const { qc, wrapper } = wrap();
    // The lists are on screen, and their refetch never comes back.
    qc.setQueryData(CORRECTION_KEYS.pending, []);
    qc.setQueryData(CORRECTION_KEYS.mine, []);
    const { result } = renderHook(
      () => ({ p: usePendingCorrections(), m: useMyCorrections() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.p.data).toEqual([]));
    api.listPendingCorrections.mockReturnValue(new Promise(() => {}));
    api.listMyCorrections.mockReturnValue(new Promise(() => {}));
    const rejected = vi.fn();
    const withdrawn = vi.fn();
    const decided = vi.fn();
    const r = renderHook(() => useRejectCorrection({ onDecided: decided }), {
      wrapper,
    });
    const w = renderHook(() => useWithdrawCorrection({ onDecided: decided }), {
      wrapper,
    });
    act(() =>
      r.result.current.mutate(
        { id: "c1", r: { reason_code: "unsafe" } },
        { onSuccess: rejected },
      ),
    );
    act(() => w.result.current.mutate({ id: "c2" }, { onSuccess: withdrawn }));
    await waitFor(() => expect(rejected).toHaveBeenCalled());
    await waitFor(() => expect(withdrawn).toHaveBeenCalled());
    expect(decided.mock.calls).toEqual([["c1"], ["c2"]]);
  });

  it("refreshes your corrections after you send a correction", async () => {
    api.sendFeedback.mockResolvedValue({
      status: "pending_review",
      correction_id: "c9",
    });
    const { result } = renderHook(
      () => ({ fb: useFeedback(), qc: useQueryClient() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <AuthTestProvider>
            <OutboxProvider>{children}</OutboxProvider>
          </AuthTestProvider>
        ),
      },
    );
    const refresh = vi.spyOn(result.current.qc, "invalidateQueries");
    await act(async () => {
      await result.current.fb.mutateAsync({
        query_id: "q1",
        action: "correct",
        corrected_diagnosis: "abc",
        reason: "abc",
      });
    });
    expect(refresh).toHaveBeenCalledWith({ queryKey: CORRECTION_KEYS.all });
  });
});
