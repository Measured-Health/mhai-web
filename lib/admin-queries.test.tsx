import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { mockAdminAs } from "@/tests/admin";

const holder = vi.hoisted(() => ({ client: null as unknown as AdminClient }));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.client }));
import { ApiError } from "./api/errors";
import {
  isMfaRequired,
  fetchAllActivity,
  useActivity,
  useHospitalSettings,
  useInviteStaff,
  useRemoveStaff,
  useStaff,
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
    await waitFor(() => expect(result.current.data).toHaveLength(13));
  });

  it("sends one idempotency key per invite, reused on its retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // shortest retry delay
    const invite = vi
      .spyOn(holder.client, "inviteStaff")
      .mockRejectedValueOnce(new ApiError(503, "error"))
      .mockResolvedValue({ invited: [], skipped: [] });
    const { result } = renderHook(() => useInviteStaff(), { wrapper });
    const i = {
      emails: ["n.ade@havanahospital.org"],
      roles: ["clinician" as const],
      specialty: null,
    };
    act(() => result.current.mutate(i));
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 4000,
    });
    const keys = invite.mock.calls.map((c) => c[1]?.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    act(() => result.current.mutate(i));
    await waitFor(() => expect(invite).toHaveBeenCalledTimes(3));
    expect(invite.mock.calls[2]![1]?.idempotencyKey).not.toBe(keys[0]);
  });

  it("drops a removed person from the cached list", async () => {
    const { result } = renderHook(
      () => ({ staff: useStaff(), remove: useRemoveStaff() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(13));
    act(() =>
      result.current.remove.mutate({
        id: "s-eze",
        auth: { mfaCode: "123456" },
      }),
    );
    await waitFor(() =>
      expect(result.current.staff.data?.some((s) => s.id === "s-eze")).toBe(
        false,
      ),
    );
  });

  it("a 404 drops the row; a 409 reloads the list (Review Focus 2)", async () => {
    const list = vi.spyOn(holder.client, "listStaff");
    const update = vi.spyOn(holder.client, "updateStaff");
    const { result } = renderHook(
      () => ({ staff: useStaff(), update: useUpdateStaff() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(13));
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
      result.current.save.mutate({ version: 0, allow_trust_device: false }),
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

  it("remove sends the code and one key, reused on its retry", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const rm = vi
      .spyOn(holder.client, "removeStaff")
      .mockRejectedValueOnce(new ApiError(503, "error"))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveStaff(), { wrapper });
    act(() =>
      result.current.mutate({ id: "s-eze", auth: { backupCode: "ABCD-1234" } }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true), {
      timeout: 4000,
    });
    expect(rm.mock.calls[0]![1]).toEqual({ backupCode: "ABCD-1234" });
    expect(rm.mock.calls[1]![2]?.idempotencyKey).toBe(
      rm.mock.calls[0]![2]?.idempotencyKey,
    );
  });

  it("mutateAsync takes the plain variables and adds a key, like mutate", async () => {
    const rm = vi.spyOn(holder.client, "removeStaff");
    const { result } = renderHook(() => useRemoveStaff(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ id: "s-eze", auth: { mfaCode: "123456" } }),
    );
    expect(rm).toHaveBeenCalledWith(
      "s-eze",
      { mfaCode: "123456" },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("a finished removal leaves no two-step code in the cache", async () => {
    const { result, unmount } = renderHook(() => useRemoveStaff(), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({ id: "s-eze", auth: { mfaCode: "123456" } }),
    );
    unmount();
    await waitFor(() => expect(qc.getMutationCache().getAll()).toEqual([]));
  });

  it.each([
    [403, "mfa_invalid"],
    [403, "mfa_required"],
    [429, "mfa_locked"],
  ])("never retries %s %s and keeps the row", async (status, code) => {
    const rm = vi
      .spyOn(holder.client, "removeStaff")
      .mockRejectedValue(new ApiError(status, code));
    const { result } = renderHook(
      () => ({ staff: useStaff(), remove: useRemoveStaff() }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.staff.data).toHaveLength(13));
    act(() =>
      result.current.remove.mutate({
        id: "s-eze",
        auth: { mfaCode: "000000" },
      }),
    );
    await waitFor(() => expect(result.current.remove.isError).toBe(true));
    expect(rm).toHaveBeenCalledTimes(1);
    expect(result.current.staff.data?.some((s) => s.id === "s-eze")).toBe(true);
    expect(isMfaRequired(result.current.remove.error)).toBe(
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
