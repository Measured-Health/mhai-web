import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import {
  clearNewBackupCode,
  pendingBackupCode,
} from "@mhai/api-client/new-backup-code";
import { createApiRequest } from "@mhai/api-client/request";
import { useStepUpCall } from "./step-up-call";

const auth = vi.hoisted(() => ({ updateUser: vi.fn() }));
vi.mock("../auth/auth-context", () => ({
  useAuth: () => ({
    user: { backupCodesLeft: 1 },
    updateUser: auth.updateUser,
  }),
}));

type Code = { mfa_code: string } | { backup_code: string };

afterEach(() => clearNewBackupCode());

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

  it("a backup code that works with no new one leaves none ready", async () => {
    auth.updateUser.mockClear();
    const { hook } = setup(async () => "done");
    let got = "";
    act(() =>
      hook.result.current.run(
        { backup_code: "ppppp-qqqqq" },
        { onSuccess: (r) => (got = r) },
      ),
    );
    await waitFor(() => expect(got).toBe("done"));
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).toHaveBeenCalledWith({ backupCodesLeft: 0 });
  });

  it("a backup code that works shows the new one first, then finishes", async () => {
    auth.updateUser.mockClear();
    // The reply as the proxy passes it: the new code in its header only.
    const { apiOk } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized: vi.fn(),
    });
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { ok: true },
        { headers: { "X-MHAI-New-Backup-Code": "rrrrr-sssss" } },
      ),
    );
    const { hook, leaked } = setup(async (v) => {
      await apiOk(fetchImpl, "/platform/team/tm_1", {
        method: "DELETE",
        body: v,
      });
      return "done";
    });
    let got = "";
    act(() =>
      hook.result.current.run(
        { backup_code: "ppppp-qqqqq" },
        { onSuccess: (r) => (got = r) },
      ),
    );
    await waitFor(() => expect(pendingBackupCode()).toBe("rrrrr-sssss"));
    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith({ backupCodesLeft: 1 }),
    );
    // Not finished until the person has seen it and pressed Continue.
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toBe("");
    expect(leaked()).not.toContain("rrrrr-sssss");
    expect(leaked()).not.toContain("ppppp-qqqqq");
    act(() => clearNewBackupCode());
    await waitFor(() => expect(got).toBe("done"));
  });

  it("a backup code spent on a refused action: the new one first, then the refusal", async () => {
    auth.updateUser.mockClear();
    const { apiOk } = createApiRequest({
      prefix: "/api/v1",
      onUnauthorized: vi.fn(),
    });
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { code: "conflict" },
        { status: 409, headers: { "X-MHAI-New-Backup-Code": "rrrrr-sssss" } },
      ),
    );
    const { hook, leaked } = setup(async (v) => {
      await apiOk(fetchImpl, "/platform/team/tm_1", {
        method: "DELETE",
        body: v,
      });
      return "done";
    });
    act(() => hook.result.current.run({ backup_code: "ppppp-qqqqq" }));
    await waitFor(() => expect(pendingBackupCode()).toBe("rrrrr-sssss"));
    await waitFor(() =>
      expect(auth.updateUser).toHaveBeenCalledWith({ backupCodesLeft: 1 }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(hook.result.current.error).toBeNull();
    expect(leaked()).not.toContain("rrrrr-sssss");
    act(() => clearNewBackupCode());
    await waitFor(() =>
      expect(hook.result.current.error).toMatchObject({ code: "conflict" }),
    );
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
    act(() => hook.result.current.run({ backup_code: "ppppp-qqqqq" }));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(ApiError),
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
