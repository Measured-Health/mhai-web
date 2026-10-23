import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, TestProviders } from "@/tests/render";
import {
  clearanceKey,
  clearanceListKey,
  useRevoke,
  useVerify,
} from "./clearances";
import { queryKeys } from "./keys";

vi.mock("next/navigation", () => ({
  usePathname: () => "/clearances",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
beforeEach(() => {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => __resetPlatformClientForTests());

const newQc = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <TestProviders queryClient={qc}>{children}</TestProviders>;
  };
}
const holdsCode = (qc: QueryClient) =>
  qc
    .getMutationCache()
    .getAll()
    .filter((m) => JSON.stringify(m.state.variables ?? {}).includes(MOCK_CODE));

describe("the clearance hooks", () => {
  it("verify puts the reply in the letter's cache, refetches the queue, the switch and Activity, and forgets the code", async () => {
    const qc = newQc();
    for (const queryKey of [
      [...clearanceListKey, "waiting"],
      queryKeys.namedAccess,
      queryKeys.activity,
    ])
      qc.setQueryData(queryKey, { stale: false });
    const { result } = renderHook(() => useVerify(), { wrapper: wrap(qc) });
    await act(() =>
      result.current.mutateAsync({
        id: "cl_north",
        version: 1,
        mfa_code: MOCK_CODE,
      }),
    );
    expect(
      qc.getQueryData<{ status: string }>(clearanceKey("cl_north"))?.status,
    ).toBe("active");
    for (const queryKey of [
      [...clearanceListKey, "waiting"],
      queryKeys.namedAccess,
      queryKeys.activity,
    ])
      expect(qc.getQueryState(queryKey)?.isInvalidated).toBe(true);
    act(() => result.current.reset());
    await waitFor(() => expect(holdsCode(qc)).toEqual([]));
  });

  it("revoke sends the version and the reason, not the id, in the body", async () => {
    const qc = newQc();
    const spy = vi.spyOn(api, "revokeClearance");
    const { result } = renderHook(() => useRevoke(), { wrapper: wrap(qc) });
    await act(() =>
      result.current.mutateAsync({
        id: "cl_act",
        reason: "no_longer_needed",
        version: 1,
        mfa_code: MOCK_CODE,
      }),
    );
    expect(
      qc.getQueryData<{ status: string }>(clearanceKey("cl_act"))?.status,
    ).toBe("revoked");
    expect(spy.mock.calls[0]![0]).toBe("cl_act");
    expect(spy.mock.calls[0]![1]).toEqual({
      reason: "no_longer_needed",
      version: 1,
      mfa_code: MOCK_CODE,
    });
  });
});
