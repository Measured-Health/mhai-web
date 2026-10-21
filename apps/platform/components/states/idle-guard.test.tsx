import { act, fireEvent, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/auth/sign-in-form";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError, type AuthClient } from "@/lib/auth/types";
import { auth, GrabAuth, renderWithAuth, testAuthClient } from "@/tests/render";
import { IdleGuard, TAB_CHANNEL } from "./idle-guard";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));

/** jsdom has no BroadcastChannel: an in-memory one, delivered at once. */
class FakeChannel {
  static open = new Set<FakeChannel>();
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) {
    FakeChannel.open.add(this);
  }
  postMessage(data: unknown) {
    for (const c of [...FakeChannel.open])
      if (c !== this && c.name === this.name)
        c.onmessage?.({ data: structuredClone(data) });
  }
  close() {
    FakeChannel.open.delete(this);
  }
}

beforeEach(() => {
  replace.mockClear();
  vi.useFakeTimers();
  vi.stubGlobal("BroadcastChannel", FakeChannel);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  FakeChannel.open.clear();
});

const MIN = 60_000;
const WARNING = "You'll be signed out in 2 minutes";
const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const flush = () => act(async () => {});
const warning = () => screen.queryByRole("dialog", { name: WARNING });

/** The app while signed in, the sign-in page once signed out. */
function Screen() {
  const a = useAuth();
  return a.status === "signed_out" ? <SignInForm /> : <p>Hospitals</p>;
}

function mount(client = testAuthClient()) {
  const keepAlive = vi.spyOn(client, "keepAlive");
  renderWithAuth(
    <>
      <GrabAuth />
      <IdleGuard />
      <Screen />
    </>,
    { client },
  );
  return { client, keepAlive };
}

describe("IdleGuard", () => {
  it("IdleGuard warns at 13 minutes and signs out at 15", async () => {
    mount();
    tick(13 * MIN - 1000);
    expect(warning()).toBeNull();
    tick(1000);
    expect(warning()).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Stay signed in" }),
    ).toBeInTheDocument();
    tick(2 * MIN - 1000);
    expect(auth.current.status).toBe("signed_in");
    tick(1000);
    await flush();
    expect(auth.current.status).toBe("signed_out");
    expect(auth.current.signedOutReason).toBe("idle");
    expect(replace).toHaveBeenCalledWith("/sign-in");
    expect(warning()).toBeNull();
  });

  it("Stay signed in resets the timer", async () => {
    const { keepAlive } = mount();
    tick(13 * MIN);
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    await flush();
    // Once on mount, once for the click.
    expect(keepAlive).toHaveBeenCalledTimes(2);
    expect(warning()).toBeNull();
    // A fresh 13 minutes from the click: past the old 15-minute mark.
    tick(13 * MIN - 1000);
    expect(warning()).toBeNull();
    expect(auth.current.status).toBe("signed_in");
    tick(1000);
    expect(warning()).toBeInTheDocument();
  });

  it("activity keeps the server session alive at most once a minute", async () => {
    const { keepAlive } = mount();
    // Once on mount (below), then at most once a minute.
    expect(keepAlive).toHaveBeenCalledTimes(1);
    const act_ = () => fireEvent.pointerDown(window);
    act_();
    tick(10_000);
    act_();
    expect(keepAlive).toHaveBeenCalledTimes(1);
    tick(MIN - 10_000);
    act_();
    await flush();
    expect(keepAlive).toHaveBeenCalledTimes(2);
    tick(30_000);
    act_();
    fireEvent.keyDown(window, { key: "a" });
    expect(keepAlive).toHaveBeenCalledTimes(2);
    tick(30_000);
    fireEvent.keyDown(window, { key: "a" });
    await flush();
    expect(keepAlive).toHaveBeenCalledTimes(3);
    // No activity, no calls.
    tick(5 * MIN);
    expect(keepAlive).toHaveBeenCalledTimes(3);
  });

  it("touches the server's idle clock once on mount, so a reload can't run ahead of it", async () => {
    const { keepAlive } = mount();
    expect(keepAlive).toHaveBeenCalledTimes(1);
    await flush();
    expect(auth.current.status).toBe("signed_in");
  });

  it("a session already over on mount signs out with the reason expired", async () => {
    const client = testAuthClient();
    vi.spyOn(client, "keepAlive").mockRejectedValue(
      new AuthError("session_expired"),
    );
    mount(client);
    await flush();
    await flush();
    expect(auth.current.status).toBe("signed_out");
    expect(auth.current.signedOutReason).toBe("expired");
  });

  it("counts from the last keep-alive the server confirmed, not later unsent activity", async () => {
    const { keepAlive } = mount();
    tick(30_000);
    // Within the minute: the server isn't told.
    fireEvent.pointerDown(window);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    tick(13 * MIN);
    expect(warning()).toBeInTheDocument();
    // 15 minutes after the server last heard, not 15:30.
    tick(MIN + 29_000);
    expect(auth.current.status).toBe("signed_in");
    tick(1000);
    await flush();
    expect(auth.current.status).toBe("signed_out");
    expect(auth.current.signedOutReason).toBe("idle");
  });

  it("an expired session on keep-alive signs out with the reason expired", async () => {
    const client = testAuthClient();
    // The mount touch succeeds; the session ends while the tab sits idle.
    vi.spyOn(client, "keepAlive")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new AuthError("session_expired"));
    renderWithAuth(
      <>
        <GrabAuth />
        <IdleGuard />
        <Screen />
      </>,
      { client },
    );
    tick(13 * MIN);
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    await flush();
    await flush();
    expect(auth.current.status).toBe("signed_out");
    expect(auth.current.signedOutReason).toBe("expired");
  });

  it("a network failure on keep-alive doesn't sign out", async () => {
    const client = testAuthClient();
    vi.spyOn(client, "keepAlive").mockRejectedValue(
      new AuthError("unavailable"),
    );
    renderWithAuth(
      <>
        <GrabAuth />
        <IdleGuard />
        <Screen />
      </>,
      { client },
    );
    tick(MIN);
    fireEvent.pointerDown(window);
    await flush();
    expect(auth.current.status).toBe("signed_in");
  });

  it("after an idle sign-out the sign-in page explains why", async () => {
    mount();
    tick(13 * MIN);
    tick(2 * MIN);
    await flush();
    expect(
      screen.getByText(
        "You were signed out after 15 minutes without activity.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Sign in to MHAI Platform" }),
    ).toBeInTheDocument();
  });

  it("does nothing while signed out", () => {
    const client = testAuthClient();
    const keepAlive = vi.spyOn(client, "keepAlive");
    renderWithAuth(<IdleGuard />, { user: null, client });
    tick(20 * MIN);
    fireEvent.pointerDown(window);
    expect(warning()).toBeNull();
    expect(keepAlive).not.toHaveBeenCalled();
  });
});

/** A tab: its own guard and sign-in state, sharing the window's channel. */
function openTab(name: string, client: AuthClient = testAuthClient()) {
  const keepAlive = vi.spyOn(client, "keepAlive");
  const signOut = vi.spyOn(client, "signOut");
  const ctx = { current: null as unknown as ReturnType<typeof useAuth> };
  function Tab() {
    const a = useAuth();
    useEffect(() => {
      ctx.current = a;
    });
    return (
      <p data-testid={name}>
        {a.status}:{a.signedOutReason ?? ""}
      </p>
    );
  }
  renderWithAuth(
    <>
      <IdleGuard />
      <Tab />
    </>,
    { client },
  );
  return {
    keepAlive,
    signOut,
    ctx,
    state: () => screen.getByTestId(name).textContent,
  };
}

describe("IdleGuard across tabs", () => {
  const warnings = () => screen.queryAllByRole("dialog", { name: WARNING });

  it("activity reaching the server from one tab restarts the other tab's clock", async () => {
    const b = openTab("b");
    tick(10 * MIN);
    // Tab A opens (or someone works there): its keep-alive tells tab B.
    openTab("a");
    await flush();
    tick(3 * MIN);
    // 13 minutes since tab B's own start, but only 3 since tab A's.
    expect(warnings()).toHaveLength(0);
    expect(b.state()).toBe("signed_in:");
    tick(10 * MIN);
    expect(warnings()).toHaveLength(2);
  });

  it("a keep-alive from another tab closes this tab's warning", () => {
    const other = new BroadcastChannel(TAB_CHANNEL);
    openTab("b");
    tick(13 * MIN);
    expect(warnings()).toHaveLength(1);
    act(() => other.postMessage({ type: "alive", at: Date.now() }));
    expect(warnings()).toHaveLength(0);
    tick(13 * MIN - 1000);
    expect(warnings()).toHaveLength(0);
    tick(1000);
    expect(warnings()).toHaveLength(1);
    other.close();
  });

  it("signing out in one tab ends the others with the same reason, asking the server once", async () => {
    const a = openTab("a");
    const b = openTab("b");
    await act(() => a.ctx.current.signOut("manual"));
    await flush();
    expect(a.state()).toBe("signed_out:manual");
    expect(b.state()).toBe("signed_out:manual");
    expect(a.signOut).toHaveBeenCalledTimes(1);
    expect(b.signOut).not.toHaveBeenCalled();
  });

  it("an idle sign-out tells the other tabs it was idle", async () => {
    const other = new BroadcastChannel(TAB_CHANNEL);
    const heard: unknown[] = [];
    other.onmessage = (e) => heard.push(e.data);
    openTab("a");
    tick(13 * MIN);
    tick(2 * MIN);
    await flush();
    expect(heard).toContainEqual({ type: "signed-out", reason: "idle" });
    other.close();
  });

  it("a sign-out from another tab doesn't touch a tab that is already signed out", async () => {
    const other = new BroadcastChannel(TAB_CHANNEL);
    const client = testAuthClient();
    const signOut = vi.spyOn(client, "signOut");
    renderWithAuth(
      <>
        <GrabAuth />
        <IdleGuard />
      </>,
      { user: null, client },
    );
    act(() => other.postMessage({ type: "signed-out", reason: "idle" }));
    await flush();
    expect(auth.current.signedOutReason).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    other.close();
  });

  it("works where the browser has no BroadcastChannel", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const a = openTab("a");
    tick(13 * MIN);
    expect(warnings()).toHaveLength(1);
    tick(2 * MIN);
    await flush();
    expect(a.state()).toBe("signed_out:idle");
  });
});
