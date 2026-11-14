import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { CODE, mockAdminAs } from "@/tests/admin";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
import { ApiError } from "./api/errors";
import {
  isMfaRequired,
  fetchAllActivity,
  useActivity,
  useHospitalSettings,
  useStaff,
  useStaffAction,
  useUpdateSettings,
  useUpdateStaff,
} from "./admin-queries";

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);
beforeEach(() => {
  qc = new QueryClient();
  holder.client = mockAdminAs(DEMO_EMAILS.director);
});
afterEach(() => vi.restoreAllMocks());

describe("admin queries", () => {
  it("lists the staff", async () => {
    const { result } = renderHook(() => useStaff(), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(12));
  });

  it("a 404 drops the row; a 409 reloads the list (Review Focus 2)", async () => {
    const list = vi.spyOn(holder.client, "listStaff");
    const update = vi.spyOn(holder.client, "updateStaff");
    const { result } = renderHook(
      () => ({ staff: useStaff(), update: useUpdateStaff() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(12));
    update.mockRejectedValueOnce(new ApiError(404, "not_found"));
    list.mockResolvedValueOnce(
      (await mockAdminAs(DEMO_EMAILS.director).listStaff()).filter(
        (s) => s.id !== "s-bello",
      ),
    );
    act(() =>
      result.current.update.mutate({
        id: "s-bello",
        p: { version: 1, specialty: "Surgery" },
        auth: CODE,
      }),
    );
    await waitFor(() =>
      expect(result.current.staff.data?.some((s) => s.id === "s-bello")).toBe(
        false,
      ),
    );
    const before = list.mock.calls.length;
    update.mockRejectedValueOnce(new ApiError(409, "conflict"));
    act(() =>
      result.current.update.mutate({
        id: "s-okafor",
        p: { version: 0, specialty: "Surgery" },
        auth: CODE,
      }),
    );
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });

  it("reloads the settings after a conflict", async () => {
    const get = vi.spyOn(holder.client, "getSettings");
    vi.spyOn(holder.client, "updateSettings").mockRejectedValueOnce(
      new ApiError(409, "conflict"),
    );
    const { result } = renderHook(
      () => ({ settings: useHospitalSettings(), save: useUpdateSettings() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.settings.data).toBeDefined());
    const calls = get.mock.calls.length;
    act(() =>
      result.current.save.mutate({
        p: { version: 0, allow_trust_device: false },
        auth: null,
      }),
    );
    await waitFor(() => expect(result.current.save.isError).toBe(true));
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
  });

  it("pages the log by cursor", async () => {
    const { result } = renderHook(() => useActivity({}), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(result.current.hasNextPage).toBe(true);
    await act(() => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data!.pages[1]!.events[0]!.id).not.toBe(
      result.current.data!.pages[0]!.events[0]!.id,
    );
  });

  it("fetches every page for an export, and says when it stopped at the cap", async () => {
    const all = await fetchAllActivity({}, 10_000);
    expect(all.capped).toBe(false);
    expect(all.events.length).toBeGreaterThan(100);
    const capped = await fetchAllActivity({}, 60);
    expect(capped).toMatchObject({ capped: true });
    expect(capped.events).toHaveLength(60);
  });

  it("a staff action sends the code and one key, reused on its retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const send = vi
      .spyOn(holder.client, "staffAction")
      .mockRejectedValueOnce(new ApiError(503, "error"));
    const { result } = renderHook(() => useStaffAction(), { wrapper });
    act(() =>
      result.current.mutate({
        id: "s-bello",
        action: "deactivate",
        auth: CODE,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 4000,
    });
    expect(send.mock.calls[0]!.slice(0, 3)).toEqual([
      "s-bello",
      "deactivate",
      CODE,
    ]);
    expect(send.mock.calls[1]![3]?.idempotencyKey).toBe(
      send.mock.calls[0]![3]?.idempotencyKey,
    );
  });

  it("a finished staff or settings write leaves no two-step code in the cache", async () => {
    const a = renderHook(() => useStaffAction(), { wrapper });
    await act(() =>
      a.result.current
        .mutateAsync({ id: "s-bello", action: "deactivate", auth: CODE })
        .catch(() => {}),
    );
    a.unmount();
    const b = renderHook(() => useUpdateStaff(), { wrapper });
    await act(() =>
      b.result.current
        .mutateAsync({
          id: "s-okafor",
          p: { version: 1, specialty: "Surgery" },
          auth: CODE,
        })
        .catch(() => {}),
    );
    b.unmount();
    const c = renderHook(() => useUpdateSettings(), { wrapper });
    await act(() =>
      c.result.current
        .mutateAsync({
          p: { version: 1, idle_timeout_minutes: 30 },
          auth: CODE,
        })
        .catch(() => {}),
    );
    c.unmount();
    await waitFor(() => expect(qc.getMutationCache().getAll()).toEqual([]));
  });

  it.each([
    [403, "mfa_invalid"],
    [403, "mfa_required"],
    [429, "mfa_locked"],
  ])("never retries %s %s and keeps the row", async (status, code) => {
    const send = vi
      .spyOn(holder.client, "staffAction")
      .mockRejectedValue(new ApiError(status, code));
    const { result } = renderHook(
      () => ({ staff: useStaff(), act: useStaffAction() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(12));
    act(() =>
      result.current.act.mutate({
        id: "s-bello",
        action: "deactivate",
        auth: { mfaCode: "000000" },
      }),
    );
    await waitFor(() => expect(result.current.act.isError).toBe(true));
    expect(send).toHaveBeenCalledTimes(1);
    expect(result.current.staff.data?.some((s) => s.id === "s-bello")).toBe(
      true,
    );
    expect(isMfaRequired(result.current.act.error)).toBe(
      code === "mfa_required",
    );
  });

  it("a 403 mfa_required read is not retried and is recognisable", async () => {
    const list = vi
      .spyOn(holder.client, "listStaff")
      .mockRejectedValue(new ApiError(403, "mfa_required"));
    const { result } = renderHook(() => useStaff(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list).toHaveBeenCalledTimes(1);
    expect(isMfaRequired(result.current.error)).toBe(true);
    expect(isMfaRequired(new ApiError(403, "forbidden"))).toBe(false);
  });
});
