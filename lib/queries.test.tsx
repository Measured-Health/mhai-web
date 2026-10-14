import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./session-store";

const status = vi.fn();
vi.mock("./api/client", () => ({
  getClient: () => ({
    getStatus: status,
    createQuery: vi.fn(async () => ({ query_id: "q1" })),
  }),
}));
import { useQueryStatus, useSubmitQuery } from "./queries";

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <SessionProvider>{children}</SessionProvider>
  </QueryClientProvider>
);

describe("useQueryStatus", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    status.mockReset();
  });

  it("stops polling once the job fails", async () => {
    status.mockResolvedValue({
      query_id: "q1",
      status: "failed",
      progress: 0.5,
      current_stage: null,
      error_code: "pipeline_timeout",
    });
    const { result } = renderHook(() => useQueryStatus("q1"), {
      wrapper: wrap,
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
    const calls = status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(status.mock.calls.length).toBe(calls);
  });

  it("marks a job stalled when progress does not move, then stops polling", async () => {
    status.mockResolvedValue({
      query_id: "q1",
      status: "processing",
      progress: 0.3,
      current_stage: "generation",
    });
    const { result } = renderHook(
      () => useQueryStatus("q1", { stallMs: 5000 }),
      { wrapper: wrap },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(result.current.stalled).toBe(true);
    const calls = status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(status.mock.calls.length).toBe(calls);
  });
});

describe("useSubmitQuery", () => {
  it("adds the consultation to the in-memory session, not storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { result } = renderHook(
      () => ({ submit: useSubmitQuery(), session: useSession() }),
      { wrapper: wrap },
    );
    await act(() =>
      result.current.submit.mutateAsync({
        patient_data: {
          age: 54,
          sex: "male",
          symptoms: ["Chest pain", "Sweating"],
        },
        clinical_question: "q".repeat(12),
        urgency: "urgent",
      }),
    );
    expect(result.current.session.items[0]).toMatchObject({
      id: "q1",
      title: "Chest pain, 54 M",
      urgency: "urgent",
    });
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
    setItem.mockRestore();
  });
});
