import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "@/components/auth/sign-in-form";
import { useAuth } from "@/lib/auth/auth-context";
import { AuthError } from "@/lib/auth/types";
import { auth, GrabAuth, renderWithAuth, testAuthClient } from "@/tests/render";
import { IdleGuard } from "./idle-guard";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
}));
beforeEach(() => {
  replace.mockClear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

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
    expect(keepAlive).toHaveBeenCalledTimes(1);
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
    const act_ = () => fireEvent.pointerDown(window);
    act_();
    tick(10_000);
    act_();
    expect(keepAlive).not.toHaveBeenCalled();
    tick(MIN - 10_000);
    act_();
    await flush();
    expect(keepAlive).toHaveBeenCalledTimes(1);
    tick(30_000);
    act_();
    fireEvent.keyDown(window, { key: "a" });
    expect(keepAlive).toHaveBeenCalledTimes(1);
    tick(30_000);
    fireEvent.keyDown(window, { key: "a" });
    await flush();
    expect(keepAlive).toHaveBeenCalledTimes(2);
    // No activity, no calls.
    tick(5 * MIN);
    expect(keepAlive).toHaveBeenCalledTimes(2);
  });

  it("counts from the last keep-alive the server confirmed, not later unsent activity", async () => {
    const { keepAlive } = mount();
    tick(30_000);
    // Within the minute: the server isn't told.
    fireEvent.pointerDown(window);
    expect(keepAlive).not.toHaveBeenCalled();
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
    vi.spyOn(client, "keepAlive").mockRejectedValue(
      new AuthError("session_expired"),
    );
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
