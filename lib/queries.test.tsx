import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { SessionProvider, useSession } from "./session-store";

const status = vi.fn();
const create = vi.fn() as Mock<
  (q?: unknown, o?: { idempotencyKey?: string }) => Promise<unknown>
>;
create.mockResolvedValue({ query_id: "q1" });
vi.mock("./api/client", () => ({
  getClient: () => ({
    getStatus: status,
    createQuery: create,
  }),
}));
import { ApiError } from "./api/errors";
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

describe("offline time and retried writes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    create.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    status.mockReset();
    vi.restoreAllMocks();
  });

  it("never counts time spent offline towards the stall", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    status.mockResolvedValue({
      query_id: "q1",
      status: "processing",
      progress: 0.3,
      current_stage: "generation",
    });
    const { result } = renderHook(() => useQueryStatus("q1"), {
      wrapper: wrapWith(makeClient()),
    });
    const advance = (ms: number) =>
      act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    await advance(10_000);
    onLine.mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    await advance(5 * 60_000);
    expect(result.current.stalled).toBe(false);
    onLine.mockReturnValue(true);
    act(() => void window.dispatchEvent(new Event("online")));
    await advance(60_000);
    expect(result.current.stalled).toBe(false);
    await advance(61_000);
    expect(result.current.stalled).toBe(true);
  });

  it("reuses one idempotency key across the retries of a submit", async () => {
    create
      .mockRejectedValueOnce(new ApiError(0, "network"))
      .mockRejectedValueOnce(new ApiError(0, "network"));
    const { result } = renderHook(() => useSubmitQuery(), {
      wrapper: wrapWith(makeClient()),
    });
    const q = {
      patient_data: { age: 54, sex: "male", symptoms: ["Chest pain"] },
      clinical_question: "q".repeat(12),
      urgency: "urgent",
    } as never;
    await act(async () => {
      const p = result.current.mutateAsync(q);
      await vi.advanceTimersByTimeAsync(30_000);
      await p;
    });
    expect(create).toHaveBeenCalledTimes(3);
    const keys = create.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toEqual(expect.any(String));
  });
});
