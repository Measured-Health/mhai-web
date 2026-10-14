import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIdle } from "./use-idle";

afterEach(() => vi.useRealTimers());

describe("useIdle", () => {
  it("fires after the idle period and resets on activity", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdle(1000, onIdle));
    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback without restarting the timer", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useIdle(1000, cb), {
      initialProps: { cb: first },
    });
    vi.advanceTimersByTime(600);
    rerender({ cb: second });
    vi.advanceTimersByTime(400);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening on unmount", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const { unmount } = renderHook(() => useIdle(1000, onIdle));
    unmount();
    vi.advanceTimersByTime(5000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
