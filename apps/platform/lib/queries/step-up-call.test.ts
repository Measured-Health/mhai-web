import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { useStepUpCall } from "./step-up-call";

const auth = vi.hoisted(() => ({ updateUser: vi.fn() }));
vi.mock("../auth/auth-context", () => ({
  useAuth: () => ({
    user: { backupCodesLeft: 3 },
    updateUser: auth.updateUser,
  }),
}));

type Code = { mfa_code: string } | { backup_code: string };

function setup(send: (v: Code) => Promise<string>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(
    () => {
      const m = useKeyedMutation(
        (v: Code) => send(v),
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

  it("a backup code that works counts down the codes left, once", async () => {
    auth.updateUser.mockClear();
    const { hook } = setup(async () => "done");
    let got = "";
    act(() =>
      hook.result.current.run(
        { backup_code: "abcd-efgh" },
        { onSuccess: (r) => (got = r) },
      ),
    );
    await waitFor(() => expect(got).toBe("done"));
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ backupCodesLeft: 2 });
  });

  it("a two-step code that works does not touch the backup codes", async () => {
    auth.updateUser.mockClear();
    const { hook } = setup(async () => "done");
    let got = "";
    act(() =>
      hook.result.current.run(
        { mfa_code: "424242" },
        { onSuccess: (r) => (got = r) },
      ),
    );
    await waitFor(() => expect(got).toBe("done"));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("a refused backup code does not use one up", async () => {
    auth.updateUser.mockClear();
    const { hook } = setup(async () => {
      throw new ApiError(403, "mfa_invalid");
    });
    act(() => hook.result.current.run({ backup_code: "abcd-efgh" }));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(ApiError),
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
