import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCorrection } from "@/tests/corrections";

const approve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ approveCorrection: approve }),
}));
import { ApiError } from "../api/errors";
import { UNDO_WINDOW_MS } from "../corrections";
import { useUndoableApproval } from "../review/use-undoable-approval";
import { createMockAuthClient } from "./mock";
import { AuthProvider, homeFor, stepsOwed, useAuth } from "./auth-context";
import type { AuthClient, User } from "./types";
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

  it("an expired session sends nothing, then or on leaving: it stays waiting", async () => {
    const client = createMockAuthClient();
    const { unmount } = mount(client, TEST_USER, <Reviewer />);
    act(() => approval.start(makeCorrection({ id: "a" })));
    await act(() => api.signOut("expired"));
    unmount();
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("signing out with an approval waiting to retry", () => {
  const keys = () =>
    approve.mock.calls.map(
      (c) => (c[1] as { idempotencyKey: string }).idempotencyKey,
    );
  /** Approved, the window ran out, and the answer was lost: retry pending. */
  async function lostAnswer() {
    const client = createMockAuthClient();
    mount(client, TEST_USER, <Reviewer />);
    act(() => approval.start(makeCorrection({ id: "a" })));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    return client;
  }
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    approve.mockReset();
    approve.mockRejectedValue(new ApiError(0, "network"));
  });
  afterEach(() => vi.useRealTimers());

  it("tries once more at sign-out, with the same key, and never after", async () => {
    await lostAnswer();
    await act(() => api.signOut("manual"));
    expect(approve).toHaveBeenCalledTimes(2);
    expect(keys()[1]).toBe(keys()[0]);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it("never sends it under the next person to sign in", async () => {
    await lostAnswer();
    await act(() => api.signOut("manual"));
    const before = approve.mock.calls.length;
    await act(() => api.signIn("new.bello@havanahospital.org", "pw"));
    expect(api.status).toBe("signed_in");
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(approve).toHaveBeenCalledTimes(before);
  });

  it("a sign-in waits for the last sign-out to finish (Sign out first)", async () => {
    const client = await lostAnswer();
    // Its last try hangs, so the sign-out takes its full 5 s.
    approve.mockReturnValueOnce(new Promise(() => {}));
    const out = vi.spyOn(client, "signOut");
    const into = vi.spyOn(client, "signIn");
    let signingOut!: Promise<void>;
    let signingIn!: Promise<unknown>;
    act(() => {
      signingOut = api.signOut("manual");
      signingIn = api.signIn("new.bello@havanahospital.org", "pw");
    });
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await act(() => Promise.all([signingOut, signingIn]));
    expect(out).toHaveBeenCalledTimes(1);
    expect(into).toHaveBeenCalledTimes(1);
    expect(out.mock.invocationCallOrder[0]).toBeLessThan(
      into.mock.invocationCallOrder[0]!,
    );
    expect(api.status).toBe("signed_in");
    expect(api.user?.email).toBe("new.bello@havanahospital.org");
    // An approval the new person makes is sent, not dropped.
    approve.mockReset();
    approve.mockResolvedValue(undefined);
    act(() => approval.start(makeCorrection({ id: "b" })));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[0]).toBe("b");
  });

  it("an expired session cancels the retry without trying", async () => {
    await lostAnswer();
    await act(() => api.signOut("expired"));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(approve).toHaveBeenCalledTimes(1);
  });
});

describe("homeFor", () => {
  const as = (...roles: User["roles"]) => ({ ...TEST_USER, roles });
  it("sends people where they belong", () => {
    expect(homeFor({ user: TEST_USER, steps: ["terms"] })).toBe("/welcome");
    expect(homeFor({ user: TEST_USER, steps: [] })).toBe("/");
    expect(
      homeFor({ user: as("clinician", "hospital_admin"), steps: [] }),
    ).toBe("/");
    expect(homeFor({ user: as("hospital_admin"), steps: [] })).toBe(
      "/admin/staff",
    );
    expect(homeFor({ user: as("admin"), steps: [] })).toBe("/no-access");
    expect(homeFor({ user: as("auditor", "clinician"), steps: [] })).toBe(
      "/no-access",
    );
    expect(homeFor({ user: as("researcher"), steps: [] })).toBe("/no-access");
  });
  it("first sign-in comes first for a hospital admin too", () => {
    expect(homeFor({ user: as("hospital_admin"), steps: ["mfa"] })).toBe(
      "/welcome",
    );
  });
  it("owes every hospital admin without two-step the setup step (amendment 3)", () => {
    const off = (...r: User["roles"]) => ({ ...as(...r), mfaEnabled: false });
    expect(stepsOwed(off("hospital_admin"), [])).toEqual(["mfa"]);
    expect(stepsOwed(off("clinician", "hospital_admin"), ["terms"])).toEqual([
      "terms",
      "mfa",
    ]);
    expect(stepsOwed(off("hospital_admin"), ["mfa"])).toEqual(["mfa"]);
    expect(stepsOwed(off("clinician"), [])).toEqual([]);
    expect(stepsOwed(as("hospital_admin"), [])).toEqual([]);
    expect(homeFor({ user: off("hospital_admin"), steps: [] })).toBe(
      "/welcome",
    );
    expect(
      homeFor({ user: off("clinician", "hospital_admin"), steps: [] }),
    ).toBe("/welcome");
  });
});
