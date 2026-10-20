import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import {
  pollDelay,
  retryDelay,
  shouldRetry,
  useNetwork,
  usePollEvery,
} from "./network";

afterEach(() => vi.restoreAllMocks());

describe("pollDelay", () => {
  it("polls quickly at first, then backs off", () => {
    const fast = { slow: false, saveData: false };
    expect(pollDelay(0, fast)).toBe(2_000);
    expect(pollDelay(29_999, fast)).toBe(2_000);
    expect(pollDelay(30_000, fast)).toBe(5_000);
    expect(pollDelay(120_000, fast)).toBe(10_000);
  });
  it("is never faster than 5 s on 2G or data saver", () => {
    expect(pollDelay(0, { slow: true, saveData: false })).toBe(5_000);
    expect(pollDelay(0, { slow: false, saveData: true })).toBe(5_000);
    expect(pollDelay(200_000, { slow: true, saveData: true })).toBe(10_000);
  });
});

describe("shouldRetry / retryDelay", () => {
  it("retries network failures and 5xx, never 4xx", () => {
    expect(shouldRetry(0, new TypeError("offline"))).toBe(true);
    expect(shouldRetry(0, new ApiError(0, "network"))).toBe(true);
    expect(shouldRetry(0, new ApiError(503, "unavailable"))).toBe(true);
    expect(shouldRetry(0, new ApiError(409, "result_not_ready"))).toBe(false);
    expect(shouldRetry(0, new ApiError(401, "session_expired"))).toBe(false);
    expect(shouldRetry(3, new TypeError("offline"))).toBe(false);
  });
  it("backs off exponentially with jitter, capped at 30 s", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    expect(retryDelay(0)).toBe(1_000);
    expect(retryDelay(3)).toBe(8_000);
    expect(retryDelay(10)).toBe(30_000);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(retryDelay(3)).toBe(4_000);
  });
});

describe("useNetwork", () => {
  it("follows online and offline events", () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { result } = renderHook(() => useNetwork());
    expect(result.current.online).toBe(true);
    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    expect(result.current.online).toBe(false);
  });
  it("reads 2G and data saver from the connection", () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: {
        effectiveType: "2g",
        saveData: true,
        addEventListener() {},
        removeEventListener() {},
      },
    });
    const { result } = renderHook(() => useNetwork());
    expect(result.current).toMatchObject({ slow: true, saveData: true });
    Reflect.deleteProperty(navigator, "connection");
  });
});

describe("usePollEvery", () => {
  it("polls only while online", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    expect(renderHook(() => usePollEvery(30_000)).result.current).toBe(30_000);
    online.mockReturnValue(false);
    expect(renderHook(() => usePollEvery(30_000)).result.current).toBe(false);
  });
});
