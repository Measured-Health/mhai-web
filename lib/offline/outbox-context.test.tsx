import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors";
import { useAuth } from "../auth/auth-context";
import { AuthTestProvider, TEST_USER } from "@/tests/auth-wrapper";
import { useSession } from "../session-store";
import { OutboxProvider, useOutbox } from "./outbox-context";

const createQuery = vi.fn();
const sendFeedback = vi.fn();
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ createQuery, sendFeedback }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const Q = {
  clinical_question: "Central chest pain for 40 minutes. Likely diagnosis?",
  urgency: "urgent" as const,
  patient_data: { age: 54, sex: "male" as const, symptoms: ["Chest pain"] },
};
const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthTestProvider>
    <OutboxProvider>{children}</OutboxProvider>
  </AuthTestProvider>
);
const otherUser = ({ children }: { children: ReactNode }) => (
  <AuthTestProvider user={{ ...TEST_USER, username: "b.other" }}>
    <OutboxProvider>{children}</OutboxProvider>
  </AuthTestProvider>
);
const use = () => ({
  box: useOutbox(),
  session: useSession(),
  auth: useAuth(),
});
let onLine: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  createQuery.mockReset();
  sendFeedback.mockReset();
  onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await new Promise<void>((r) => {
    const req = indexedDB.deleteDatabase("mhai-outbox");
    req.onsuccess = req.onerror = req.onblocked = () => r();
  });
});
afterEach(() => vi.restoreAllMocks());

describe("OutboxProvider", () => {
  it("queues offline, then syncs once online, in order, with each key", async () => {
    createQuery.mockResolvedValue({ query_id: "q-real" });
    sendFeedback.mockResolvedValue({ status: "recorded" });
    const { result } = renderHook(use, { wrapper });
    let localId = "";
    await act(async () => {
      localId = await result.current.box.queueQuery(Q);
      result.current.session.add({
        id: localId,
        title: "Chest pain, 54 M",
        urgency: "urgent",
        createdAt: 1,
        query: Q,
        pending: "waiting",
      });
      await result.current.box.queueFeedback({
        query_id: "q-old",
        action: "validate",
      });
    });
    await waitFor(() => expect(result.current.box.items).toHaveLength(2));
    expect(createQuery).not.toHaveBeenCalled();

    onLine.mockReturnValue(true);
    await act(async () => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(result.current.box.items).toHaveLength(0));
    expect(createQuery).toHaveBeenCalledWith(Q, {
      idempotencyKey: expect.any(String),
    });
    expect(sendFeedback).toHaveBeenCalledWith(
      { query_id: "q-old", action: "validate" },
      { idempotencyKey: expect.any(String) },
    );
    expect(createQuery.mock.invocationCallOrder[0]).toBeLessThan(
      sendFeedback.mock.invocationCallOrder[0]!,
    );
    expect(result.current.box.resolved[localId]).toBe("q-real");
    expect(result.current.session.get("q-real")?.pending).toBeUndefined();
    expect(result.current.session.get(localId)).toBeUndefined();
  });

  it("keeps items after a network failure, and marks a rejected one", async () => {
    createQuery
      .mockRejectedValueOnce(new ApiError(0, "network"))
      .mockRejectedValueOnce(new ApiError(422, "validation_failed"));
    const { result } = renderHook(use, { wrapper });
    await act(async () => void (await result.current.box.queueQuery(Q)));
    onLine.mockReturnValue(true);
    await act(async () => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(createQuery).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.box.syncing).toBe(false));
    expect(result.current.box.items[0]?.status).toBe("waiting");
    act(() => result.current.box.syncNow());
    await waitFor(() =>
      expect(result.current.box.items[0]?.status).toBe("failed"),
    );
    expect(createQuery).toHaveBeenCalledTimes(2);
  });

  it("adds a synced question to history when this session never had it", async () => {
    createQuery.mockResolvedValue({ query_id: "q-new" });
    const { result } = renderHook(use, { wrapper });
    await act(async () => void (await result.current.box.queueQuery(Q)));
    onLine.mockReturnValue(true);
    act(() => result.current.box.syncNow());
    await waitFor(() =>
      expect(result.current.session.get("q-new")?.title).toBe(
        "Chest pain, 54 M",
      ),
    );
  });

  it("waits for the owner instead of failing right after sign-in", async () => {
    const { result } = renderHook(use, { wrapper });
    // Called in the same tick as the first render: the owner isn't known yet.
    const p = result.current.box.queueQuery(Q);
    await act(async () => void (await p));
    await waitFor(() => expect(result.current.box.items).toHaveLength(1));
    expect(result.current.box.ready).toBe(true);
    expect(result.current.box.loaded).toBe(true);
  });

  it("keeps items for the same user only, across sign-out", async () => {
    const first = renderHook(use, { wrapper });
    await act(async () => void (await first.result.current.box.queueQuery(Q)));
    await act(() => first.result.current.auth.signOut("idle"));
    expect(first.result.current.box.items).toEqual([]);
    expect(first.result.current.box.ready).toBe(false);
    first.unmount();

    const other = renderHook(use, { wrapper: otherUser });
    await waitFor(() => expect(other.result.current.box.loaded).toBe(true));
    expect(other.result.current.box.items).toEqual([]);
    other.unmount();

    const again = renderHook(use, { wrapper });
    await waitFor(() => expect(again.result.current.box.items).toHaveLength(1));
  });

  it("deletes everything of mine on request", async () => {
    const { result } = renderHook(use, { wrapper });
    await act(async () => void (await result.current.box.queueQuery(Q)));
    await act(() => result.current.box.clearMine());
    expect(result.current.box.items).toEqual([]);
  });

  it("discards one item by its local id", async () => {
    const { result } = renderHook(use, { wrapper });
    let localId = "";
    await act(async () => {
      localId = await result.current.box.queueQuery(Q);
    });
    await waitFor(() => expect(result.current.box.items).toHaveLength(1));
    await act(() => result.current.box.discard(localId));
    expect(result.current.box.items).toEqual([]);
  });

  it("is inert outside the provider", async () => {
    const { result } = renderHook(() => useOutbox());
    expect(result.current).toMatchObject({
      items: [],
      resolved: {},
      syncing: false,
      loaded: true,
      ready: false,
    });
    await expect(result.current.queueQuery(Q)).rejects.toThrow("Not signed in");
  });
});
