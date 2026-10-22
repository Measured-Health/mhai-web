import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { useStepUpCall } from "./step-up-call";

vi.mock("../auth/auth-context", () => ({
  useAuth: () => ({ user: null, updateUser: () => {} }),
}));

function setup(send: (v: { mfa_code: string }) => Promise<string>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(
    () => {
      const m = useKeyedMutation(
        (v: { mfa_code: string }) => send(v),
        {},
        {
          gcTime: 0,
        },
      );
      return useStepUpCall(m);
    },
    { wrapper },
  );
  const leaked = () =>
    JSON.stringify(
      qc
        .getMutationCache()
        .getAll()
        .map((m) => m.state.variables),
    );
  return { hook, leaked };
}

describe("useStepUpCall", () => {
  it("forgets the code after an answer and hands it on", async () => {
    const { hook, leaked } = setup(async () => "done");
    let got = "";
    act(() =>
      hook.result.current.run(
        { mfa_code: "424242" },
        { onSuccess: (r) => (got = r) },
      ),
    );
    await waitFor(() => expect(got).toBe("done"));
    expect(hook.result.current.busy).toBe(false);
    expect(leaked()).not.toContain("424242");
  });

  it("forgets the code after a refusal and keeps the refusal to show", async () => {
    const { hook, leaked } = setup(async () => {
      throw new ApiError(403, "mfa_invalid");
    });
    act(() => hook.result.current.run({ mfa_code: "424242" }));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(ApiError),
    );
    expect(leaked()).not.toContain("424242");
    act(() => hook.result.current.clear());
    expect(hook.result.current.error).toBeNull();
  });
});
