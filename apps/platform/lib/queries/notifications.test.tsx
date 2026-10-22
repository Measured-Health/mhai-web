import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import type { NotificationsOut } from "@/lib/api/notifications-contract";
import {
  notificationsKey,
  useMarkSeen,
  useNotifications,
} from "./notifications";
import { endSessionRequests } from "./session-end";

afterEach(() => __resetPlatformClientForTests());

const out = (unseen: number): NotificationsOut => ({ unseen, items: [] });

function setup(client: Partial<PlatformClient>) {
  __setPlatformClientForTests(client as PlatformClient);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe("sign-out and the bell", () => {
  it("a mark-seen still in flight does not touch the next person's bell", async () => {
    let finish: (v: { unseen: number }) => void = () => {};
    const { qc, wrapper } = setup({
      markSeen: () => new Promise((r) => (finish = r)),
    });
    const { result } = renderHook(() => useMarkSeen(), { wrapper });
    act(() => result.current.mutate(undefined));
    await waitFor(() => expect(result.current.isPending).toBe(true));

    // Ada signs out; Tunde signs in and his count loads.
    act(() => {
      endSessionRequests(qc);
      qc.clear();
    });
    qc.setQueryData(notificationsKey, out(3));

    // Ada's answer arrives late.
    await act(async () => finish({ unseen: 0 }));
    expect(qc.getQueryData<NotificationsOut>(notificationsKey)).toEqual(out(3));
    expect(qc.isFetching({ queryKey: notificationsKey })).toBe(0);
  });

  it("a mark-seen after the sign-out is never sent on a retry", async () => {
    const markSeen = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValue({ unseen: 0 });
    const { qc, wrapper } = setup({ markSeen });
    const { result } = renderHook(() => useMarkSeen(), { wrapper });
    act(() => result.current.mutate(undefined));
    await waitFor(() => expect(markSeen).toHaveBeenCalledTimes(1));
    act(() => {
      endSessionRequests(qc);
      qc.clear();
    });
    qc.setQueryData(notificationsKey, out(3));
    await new Promise((r) => setTimeout(r, 1_500));
    expect(markSeen).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData<NotificationsOut>(notificationsKey)).toEqual(out(3));
  });

  it("a notifications check in flight is cancelled at sign-out", async () => {
    let finish: (v: NotificationsOut) => void = () => {};
    const { qc, wrapper } = setup({
      listNotifications: () => new Promise((r) => (finish = r)),
    });
    renderHook(() => useNotifications(), { wrapper });
    await waitFor(() =>
      expect(qc.isFetching({ queryKey: notificationsKey })).toBe(1),
    );
    await act(async () => {
      endSessionRequests(qc);
    });
    expect(qc.isFetching({ queryKey: notificationsKey })).toBe(0);
    await act(async () => finish(out(7)));
    expect(qc.getQueryData(notificationsKey)).toBeUndefined();
  });
});
