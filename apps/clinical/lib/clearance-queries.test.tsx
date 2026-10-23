import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "./api/admin";
import type { ClearanceClient } from "./api/clearances";
import { resetClearances } from "./api/mock-clearances";
import { MOCK_CODE } from "./auth/mock";
import { dayAfter, pdf, sampleClients } from "@/tests/clearances";

const holder = vi.hoisted(() => ({
  admin: null as unknown as AdminClient,
  clearances: null as unknown as ClearanceClient,
}));
vi.mock("./api/admin", () => ({ getAdminClient: () => holder.admin }));
vi.mock("./api/clearances", () => ({
  getClearanceClient: () => holder.clearances,
}));
import {
  CLEARANCE_KEYS,
  useClearances,
  useUploadClearance,
} from "./clearance-queries";

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(() => {
  resetClearances();
  Object.assign(holder, sampleClients());
  qc = new QueryClient();
});
afterEach(() => vi.restoreAllMocks());

describe("clearance queries", () => {
  it("keeps every key under clearances", () => {
    expect(CLEARANCE_KEYS.all).toEqual(["clearances"]);
    expect(CLEARANCE_KEYS.list[0]).toBe("clearances");
    expect(CLEARANCE_KEYS.one("cl_act")).toEqual([
      "clearances",
      "one",
      "cl_act",
    ]);
    expect(CLEARANCE_KEYS.named).toEqual(["clearances", "named-access"]);
  });

  it("polls only while a letter is being checked", async () => {
    const { result } = renderHook(() => useClearances(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const q = qc.getQueryCache().find({ queryKey: CLEARANCE_KEYS.list })!;
    const interval = (
      q.observers[0]!.options as { refetchInterval: (q: unknown) => unknown }
    ).refetchInterval;
    expect(interval(q)).toBe(5_000);
    qc.setQueryData(CLEARANCE_KEYS.list, {
      ...result.current.data!,
      clearances: result.current.data!.clearances.filter(
        (c) => c.status !== "checking",
      ),
    });
    expect(interval(q)).toBe(false);
  });

  it("an upload forgets its variables (the file and the code) once done", async () => {
    const { result, unmount } = renderHook(() => useUploadClearance(), {
      wrapper,
    });
    const today = (await holder.clearances.listClearances()).today;
    await act(() =>
      result.current.mutateAsync({
        file: pdf(),
        signed_by: "Dr. Funmi Ade",
        signer_title: "Chief Medical Director",
        letter_date: today,
        covered: ["s-obi"],
        end_date: dayAfter(today, 90),
        mfaCode: MOCK_CODE,
      }),
    );
    unmount();
    await waitFor(() => expect(qc.getMutationCache().getAll()).toHaveLength(0));
  });
});
