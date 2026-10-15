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

  it("counts scrolling and wheel inside any element as activity", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const box = document.createElement("div");
    document.body.append(box);
    renderHook(() => useIdle(1000, onIdle));
    vi.advanceTimersByTime(900);
    box.dispatchEvent(new Event("scroll")); // scroll does not bubble
    vi.advanceTimersByTime(900);
    box.dispatchEvent(new Event("wheel", { bubbles: true }));
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    box.remove();
  });

  it("uses wall-clock time: fires on wake even when no timer ticked", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdle(60_000, onIdle));
    const start = Date.now();
    vi.setSystemTime(start + 5 * 60_000);
    window.dispatchEvent(new Event("pageshow"));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledWith(start);
  });

  it("restarts the idle period on reset()", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const { result } = renderHook(() => useIdle(1000, onIdle));
    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledTimes(1);
    result.current();
    vi.advanceTimersByTime(999);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it("activity after the deadline passed with no tick fires instead of resetting", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdle(60_000, onIdle));
    const start = Date.now();
    vi.setSystemTime(start + 5 * 60_000);
    window.dispatchEvent(new Event("keydown"));
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(onIdle).toHaveBeenCalledWith(start);
  });

  it("activity before the deadline still restarts the period", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdle(60_000, onIdle));
    vi.setSystemTime(Date.now() + 59_000);
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(59_000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
