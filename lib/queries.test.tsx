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

const makeClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
function wrapWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <SessionProvider>{children}</SessionProvider>
      </QueryClientProvider>
    );
  };
}
const wrap = wrapWith(makeClient());

describe("useQueryStatus", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    status.mockReset();
    vi.restoreAllMocks();
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

describe("useQueryStatus stall reset and id change", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    status.mockReset();
    vi.restoreAllMocks();
  });

  it("resets the stall clock when progress moves", async () => {
    status.mockResolvedValue({
      query_id: "q1",
      status: "processing",
      progress: 0.3,
      current_stage: "generation",
    });
    const { result } = renderHook(
      () => useQueryStatus("q1", { stallMs: 5000 }),
      { wrapper: wrapWith(makeClient()) },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    // The 2 s poll at t=4 s picks up the new progress.
    status.mockResolvedValue({
      query_id: "q1",
      status: "processing",
      progress: 0.4,
      current_stage: "generation",
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(result.current.progress).toBe(0.4);
    expect(result.current.stalled).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(result.current.stalled).toBe(true);
  });

  it("does not carry a stall over to a new id", async () => {
    status.mockResolvedValue({
      query_id: "q1",
      status: "processing",
      progress: 0.3,
      current_stage: "generation",
    });
    const { result, rerender } = renderHook(
      ({ id }) => useQueryStatus(id, { stallMs: 5000 }),
      { wrapper: wrapWith(makeClient()), initialProps: { id: "q1" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(result.current.stalled).toBe(true);
    rerender({ id: "q2" });
    expect(result.current.stalled).toBe(false);
    const calls = status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(status.mock.calls.length).toBeGreaterThan(calls);
    expect(result.current.stalled).toBe(false);
  });
});

describe("session clear", () => {
  it("also drops cached results from the query cache", async () => {
    const client = makeClient();
    client.setQueryData(["result", "q1"], { query_id: "q1" });
    const { result } = renderHook(() => useSession(), {
      wrapper: wrapWith(client),
    });
    expect(client.getQueryData(["result", "q1"])).toBeDefined();
    act(() => result.current.clear());
    expect(client.getQueryData(["result", "q1"])).toBeUndefined();
  });
});

describe("useSubmitQuery", () => {
  afterEach(() => vi.restoreAllMocks());
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
  });
});
