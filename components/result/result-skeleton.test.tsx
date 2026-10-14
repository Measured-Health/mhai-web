import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResultSkeleton } from "./result-skeleton";

describe("ResultSkeleton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows nothing until loading has lasted 200 ms", () => {
    render(<ResultSkeleton />);
    expect(screen.queryByLabelText("Loading result")).toBeNull();
    act(() => void vi.advanceTimersByTime(199));
    expect(screen.queryByLabelText("Loading result")).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByLabelText("Loading result")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("never appears if unmounted before the delay", () => {
    const { unmount } = render(<ResultSkeleton />);
    unmount();
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.queryByLabelText("Loading result")).toBeNull();
  });
});
