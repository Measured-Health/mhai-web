import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { StrictMode, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCorrection } from "@/tests/corrections";

const approve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ approveCorrection: approve }),
}));
import { ApiError } from "@/lib/api/errors";
import { UNDO_WINDOW_MS } from "@/lib/corrections";
import { endApprovalSession, flushPendingApprovals } from "./pending-approvals";
import { useUndoableApproval } from "./use-undoable-approval";

const a = makeCorrection({ id: "a" });
const b = makeCorrection({ id: "b" });
const onSent = vi.fn();
const onFailed = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);
const setup = () =>
  renderHook(() => useUndoableApproval({ onSent, onFailed }), { wrapper });
const sentIds = () => approve.mock.calls.map((c) => c[0]);
const opts = (i: number) =>
  approve.mock.calls[i]?.[1] as { idempotencyKey: string; keepalive: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  approve.mockReset();
  approve.mockResolvedValue(undefined);
  onSent.mockReset();
  onFailed.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUndoableApproval (Review Focus 2)", () => {
  it("sends nothing during the window, then once, with one key", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    expect(result.current.pending?.item.id).toBe("a");
    expect(result.current.pending?.endsAt).toBe(Date.now() + UNDO_WINDOW_MS);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1));
    expect(approve).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0)).toEqual({
      idempotencyKey: expect.any(String),
      keepalive: false,
    });
    expect(result.current.pending).toBeNull();
    expect(onSent).toHaveBeenCalledWith(a);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("gives a whole minute to undo (product ruling)", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    expect(result.current.pending?.endsAt).toBe(Date.now() + 60_000);
    await act(() => vi.advanceTimersByTimeAsync(59_999));
    expect(approve).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(sentIds()).toEqual(["a"]);
  });

  it("undo inside the window sends nothing and gives the item back", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS / 2));
    let back: unknown;
    act(() => {
      back = result.current.undo();
    });
    expect(back).toBe(a);
    expect(result.current.pending).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3));
    expect(approve).not.toHaveBeenCalled();
  });

  it("undo after the window has ended does nothing", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    let back: unknown = "unset";
    act(() => {
      back = result.current.undo();
    });
    expect(back).toBeNull();
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("approving the next one sends the first at once, each with its own key", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    act(() => result.current.start(b));
    expect(sentIds()).toEqual(["a"]);
    expect(result.current.pending?.item.id).toBe("b");
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(sentIds()).toEqual(["a", "b"]);
    expect(opts(0).idempotencyKey).not.toBe(opts(1).idempotencyKey);
  });

  it("flush sends at once (another decision started)", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    await act(async () => result.current.flush());
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0).keepalive).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("leaving the page in the app sends at once, with keepalive", async () => {
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    unmount();
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0).keepalive).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("a reload or closing the tab (pagehide) sends at once, with keepalive", async () => {
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0).keepalive).toBe(true);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("offline at the end: not sent, and handed back as a network failure (Review Focus 3)", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(a, expect.any(ApiError));
    expect((onFailed.mock.calls[0]?.[1] as ApiError).status).toBe(0);
    expect(result.current.pending).toBeNull();
  });

  it("hands a refusal back", async () => {
    approve.mockRejectedValueOnce(new ApiError(409, "already_decided"));
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(onFailed).toHaveBeenCalledWith(
      a,
      expect.objectContaining({ status: 409 }),
    );
    expect(onSent).not.toHaveBeenCalled();
  });

  it("retries a lost answer twice with the same key, so it isn't put back", async () => {
    approve.mockRejectedValueOnce(new ApiError(0, "network"));
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(sentIds()).toEqual(["a", "a"]);
    expect(opts(1).idempotencyKey).toBe(opts(0).idempotencyKey);
    expect(onSent).toHaveBeenCalledWith(a);
    expect(onFailed).not.toHaveBeenCalled();
  });

  it("gives up after two retries, and never retries a refusal", async () => {
    approve.mockRejectedValue(new ApiError(503, "unavailable"));
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 120_000));
    expect(approve).toHaveBeenCalledTimes(3);
    expect(onFailed).toHaveBeenCalledTimes(1);

    approve.mockReset();
    onFailed.mockReset();
    approve.mockRejectedValue(new ApiError(409, "already_decided"));
    act(() => result.current.start(b));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS + 120_000));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a send made on leaving the page", async () => {
    approve.mockRejectedValue(new ApiError(0, "network"));
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("a sign-out sends the waiting one first, once, with its key", async () => {
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    const key = result.current.pending?.key;
    await act(() => flushPendingApprovals());
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0)).toEqual({ idempotencyKey: key, keepalive: false });
    expect(onSent).toHaveBeenCalledWith(a);
    unmount();
    await act(() => flushPendingApprovals());
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("a sign-out cuts a retry's wait short: one last try, same key", async () => {
    approve.mockRejectedValue(new ApiError(503, "unavailable"));
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    await act(() => flushPendingApprovals());
    expect(approve).toHaveBeenCalledTimes(2);
    expect(opts(1).idempotencyKey).toBe(opts(0).idempotencyKey);
    expect(onFailed).toHaveBeenCalledTimes(1);
    act(() => endApprovalSession());
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it("a new session drops a retry; only a view still open hears of it", async () => {
    approve.mockRejectedValue(new ApiError(0, "network"));
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    act(() => endApprovalSession());
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(onFailed).toHaveBeenCalledTimes(1);

    approve.mockClear();
    onFailed.mockReset();
    act(() => result.current.start(b));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    unmount();
    act(() => endApprovalSession());
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(onFailed).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it("a sign-out never waits long for a slow send", async () => {
    approve.mockReturnValue(new Promise(() => {}));
    const { result } = setup();
    act(() => result.current.start(a));
    let done = false;
    void flushPendingApprovals().then(() => (done = true));
    await act(() => vi.advanceTimersByTimeAsync(4_999));
    expect(done).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(done).toBe(true);
  });

  it("StrictMode's double effects send nothing and the timer still sends once", async () => {
    const { result } = renderHook(
      () => useUndoableApproval({ onSent, onFailed }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <StrictMode>{wrapper({ children })}</StrictMode>
        ),
      },
    );
    expect(approve).not.toHaveBeenCalled();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(sentIds()).toEqual(["a"]);
  });
});
