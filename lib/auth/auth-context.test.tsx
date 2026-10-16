import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCorrection } from "@/tests/corrections";

const approve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ approveCorrection: approve }),
}));
import { useUndoableApproval } from "../review/use-undoable-approval";
import { createMockAuthClient } from "./mock";
import { AuthProvider, homeFor, useAuth } from "./auth-context";
import type { AuthClient } from "./types";
import { SessionProvider, useSession } from "../session-store";
import { TEST_USER } from "@/tests/auth-wrapper";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => replace.mockClear());

let api: ReturnType<typeof useAuth>;
let history: ReturnType<typeof useSession>;
function Probe() {
  const a = useAuth();
  const h = useSession();
  useEffect(() => {
    api = a;
    history = h;
  });
  return <p data-testid="status">{a.status}</p>;
}
let approval: ReturnType<typeof useUndoableApproval>;
/** The review page: an approval can be waiting in its undo window. */
function Reviewer() {
  const a = useUndoableApproval({ onSent: () => {}, onFailed: () => {} });
  useEffect(() => {
    approval = a;
  });
  return null;
}
const mount = (
  client: AuthClient,
  initialUser?: typeof TEST_USER | null,
  extra?: ReactNode,
) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SessionProvider>
        <AuthProvider client={client} initialUser={initialUser}>
          <Probe />
          {extra}
        </AuthProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );

describe("AuthProvider", () => {
  it("looks up the session on mount", async () => {
    const client = createMockAuthClient();
    await client.signIn("new@h.org", "pw");
    mount(client);
    expect(screen.getByTestId("status")).toHaveTextContent("loading");
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("signed_in");
      expect(api.steps).toEqual(["terms", "password", "mfa"]);
    });
  });

  it("signs in, tracks a pending code, and finishes first sign-in steps", async () => {
    mount(createMockAuthClient(), null);
    await act(() => api.signIn("mfa@h.org", "pw"));
    expect(api.mfaPending).toBe(true);
    expect(api.status).toBe("signed_out");
    await act(() =>
      api.verifyCode("123456", { backup: false, trustDevice: false }),
    );
    expect(api.status).toBe("signed_in");
    expect(api.mfaPending).toBe(false);
    await act(() => api.signIn("new@h.org", "pw"));
    expect(api.steps).toEqual(["terms", "password", "mfa"]);
    act(() => api.completeStep("terms"));
    expect(api.steps).toEqual(["password", "mfa"]);
  });

  it("signs out once, clears history, and says why", async () => {
    const client = createMockAuthClient();
    const spy = vi.spyOn(client, "signOut");
    mount(client, TEST_USER);
    act(() =>
      history.add({
        id: "q1",
        title: "t",
        urgency: "routine",
        createdAt: 1,
        query: {} as never,
      }),
    );
    await act(() => api.signOut("manual"));
    await act(() => api.signOut("expired"));
    expect(api.status).toBe("signed_out");
    expect(api.signedOutReason).toBe("manual");
    expect(history.items).toEqual([]);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => api.dismissNotice());
    expect(api.signedOutReason).toBeNull();
  });
});

describe("signing out with an approval waiting", () => {
  beforeEach(() => {
    approve.mockReset();
    approve.mockResolvedValue(undefined);
  });

  it.each(["manual", "idle"] as const)(
    "%s: sends it first, with its key, then ends the session",
    async (why) => {
      const client = createMockAuthClient();
      const end = vi.spyOn(client, "signOut");
      const { unmount } = mount(client, TEST_USER, <Reviewer />);
      act(() => approval.start(makeCorrection({ id: "a" })));
      const key = approval.pending?.key;
      await act(() => api.signOut(why));
      expect(approve).toHaveBeenCalledTimes(1);
      expect(approve).toHaveBeenCalledWith("a", {
        idempotencyKey: key,
        keepalive: false,
      });
      expect(end).toHaveBeenCalledTimes(1);
      expect(approve.mock.invocationCallOrder[0]).toBeLessThan(
        end.mock.invocationCallOrder[0]!,
      );
      unmount();
      expect(approve).toHaveBeenCalledTimes(1);
    },
  );

  it("an expired session doesn't try; leaving the page still does once", async () => {
    const client = createMockAuthClient();
    const { unmount } = mount(client, TEST_USER, <Reviewer />);
    act(() => approval.start(makeCorrection({ id: "a" })));
    await act(() => api.signOut("expired"));
    unmount();
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[1]).toMatchObject({ keepalive: true });
  });
});

describe("homeFor", () => {
  it("sends people where they belong", () => {
    expect(homeFor({ user: TEST_USER, steps: ["terms"] })).toBe("/welcome");
    expect(homeFor({ user: { ...TEST_USER, role: "admin" }, steps: [] })).toBe(
      "/no-access",
    );
    expect(homeFor({ user: TEST_USER, steps: [] })).toBe("/");
  });
});
