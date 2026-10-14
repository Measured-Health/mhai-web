import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { QueryCreateIn, Readiness } from "@/lib/api/contract";
import { useSession, type SessionItem } from "@/lib/session-store";
import { AppShell, useShell } from "../shell/app-shell";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
const readiness = vi.fn(async (): Promise<Readiness> => ({
  ok: true,
  degraded_services: [],
}));
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ getReadiness: readiness }),
}));

import { DegradedStrip } from "./degraded-strip";
import { FailedView } from "./failed-view";
import { FirstVisit } from "./first-visit";
import { OfflineStrip } from "./offline-strip";
import { SessionTimeout } from "./session-timeout";
import { UnsavedGuard } from "./unsaved-guard";

const ITEM: SessionItem = {
  id: "q1",
  title: "Chest pain, 54 M",
  urgency: "urgent",
  createdAt: 1,
  query: {
    clinical_question: "Central chest pain for 40 min. Likely diagnosis?",
    urgency: "urgent",
    patient_data: { age: 54, sex: "male", symptoms: ["Chest pain"] },
  } satisfies QueryCreateIn,
};
function Seed() {
  const { add } = useSession();
  useEffect(() => add(ITEM), [add]);
  return null;
}
function Count() {
  return <output data-testid="count">{useSession().items.length}</output>;
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("FailedView", () => {
  it("offers Try again as the main action and keeps inputs via Edit question", async () => {
    const onRetry = vi.fn(),
      onEdit = vi.fn();
    render(<FailedView onRetry={onRetry} onEdit={onEdit} />);
    expect(
      screen.getByRole("heading", { name: "We couldn't complete this one" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your answers are saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Edit question/ }),
    );
    expect(onRetry).toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalled();
  });
  it("explains a stall differently from a failure", () => {
    render(<FailedView stalled onRetry={vi.fn()} onEdit={vi.fn()} />);
    expect(
      screen.getByText(/taking much longer than usual/),
    ).toBeInTheDocument();
  });
});

describe("FirstVisit", () => {
  it("fills the form from an example", async () => {
    const onExample = vi.fn();
    render(
      <FirstVisit name="Dr. Reyes" onStart={vi.fn()} onExample={onExample} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(onExample).toHaveBeenCalledWith(
      expect.objectContaining({ age: "3", sex: "female" }),
    );
  });
  it("starts an empty consultation", async () => {
    const onStart = vi.fn();
    render(
      <FirstVisit name="Dr. Reyes" onStart={onStart} onExample={vi.fn()} />,
    );
    expect(screen.getByText(/Welcome, Dr. Reyes/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /Start a consultation/ }),
    );
    expect(onStart).toHaveBeenCalled();
  });
});

describe("UnsavedGuard", () => {
  it("asks the browser to confirm leaving only when dirty, and writes nothing to storage", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { rerender } = render(<UnsavedGuard dirty={false} />);
    const e1 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(false);
    rerender(<UnsavedGuard dirty />);
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(true);
    rerender(<UnsavedGuard dirty={false} />);
    const e3 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e3);
    expect(e3.defaultPrevented).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it("asks before following an in-app link when dirty; Keep editing is the default", async () => {
    render(
      <>
        <UnsavedGuard dirty />
        <a href="/help">Help</a>
      </>,
    );
    await userEvent.click(screen.getByText("Help"));
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(
      screen.queryByRole("dialog", { name: "Discard this draft?" }),
    ).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("does not intercept links when the form is clean", async () => {
    const seen = vi.fn((e: MouseEvent) => e.preventDefault());
    document.addEventListener("click", seen);
    render(
      <>
        <UnsavedGuard dirty={false} />
        <a href="/help">Help</a>
      </>,
    );
    await userEvent.click(screen.getByText("Help"));
    document.removeEventListener("click", seen);
    expect(seen).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  function Nav({ to }: { to: string }) {
    const { navigate } = useShell();
    return (
      <button type="button" onClick={() => navigate(to)}>
        go {to}
      </button>
    );
  }
  const inShell = (dirty: boolean, onDiscard = vi.fn()) => (
    <Providers>
      <AppShell>
        <Seed />
        <UnsavedGuard dirty={dirty} onDiscard={onDiscard} />
        <Nav to="/c/q9" />
      </AppShell>
    </Providers>
  );

  it("catches the sidebar New consultation and history links mid-draft", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const onDiscard = vi.fn();
    render(inShell(true, onDiscard));

    await userEvent.click(
      screen.getAllByRole("link", { name: /New consultation/ })[0],
    );
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(push).not.toHaveBeenCalled();

    await userEvent.click(
      (await screen.findAllByRole("link", { name: /Chest pain, 54 M/ }))[0],
    );
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/c/q1");
    expect(setItem).not.toHaveBeenCalled();
  });

  it("catches programmatic navigate() mid-draft, and Discard clears the guard first", async () => {
    render(inShell(true));
    await userEvent.click(screen.getByRole("button", { name: "go /c/q9" }));
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(push).toHaveBeenCalledWith("/c/q9");
    // The guard is gone, so a second navigate goes straight through.
    await userEvent.click(screen.getByRole("button", { name: "go /c/q9" }));
    expect(push).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lets navigate() through when the form is clean, and clears the guard on unmount", async () => {
    const { rerender } = render(inShell(false));
    await userEvent.click(screen.getByRole("button", { name: "go /c/q9" }));
    expect(push).toHaveBeenCalledTimes(1);
    rerender(inShell(true));
    await userEvent.click(screen.getByRole("button", { name: "go /c/q9" }));
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("UnsavedGuard unmount", () => {
  it("removes its guard when it unmounts", async () => {
    function Host({ on }: { on: boolean }) {
      const { navigate } = useShell();
      return (
        <>
          {on && <UnsavedGuard dirty />}
          <button type="button" onClick={() => navigate("/x")}>
            nav
          </button>
        </>
      );
    }
    const ui = (on: boolean) => (
      <Providers>
        <AppShell>
          <Host on={on} />
        </AppShell>
      </Providers>
    );
    const { rerender } = render(ui(true));
    await userEvent.click(screen.getByRole("button", { name: "nav" }));
    expect(push).not.toHaveBeenCalled();
    rerender(ui(false));
    await userEvent.click(screen.getByRole("button", { name: "nav" }));
    expect(push).toHaveBeenCalledWith("/x");
  });
});

describe("SessionTimeout", () => {
  const mount = (onSignOut = vi.fn()) =>
    render(
      <Providers>
        <Seed />
        <Count />
        <SessionTimeout
          warnAfterMs={1000}
          signOutAfterMs={3000}
          onSignOut={onSignOut}
        />
      </Providers>,
    );
  const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it("warns with a countdown, then signs out and clears the session", () => {
    vi.useFakeTimers();
    const onSignOut = vi.fn();
    mount(onSignOut);
    expect(screen.getByTestId("count")).toHaveTextContent("1");
    tick(999);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    tick(1);
    expect(
      screen.getByRole("dialog", { name: "Still there?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("0:02")).toBeInTheDocument();
    tick(1000);
    expect(screen.getByText("0:01")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    tick(1000);
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/");
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Signed out for privacy")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the session when the clinician stays signed in", () => {
    vi.useFakeTimers();
    mount();
    tick(1000);
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    tick(500);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });

  it("signs out at once from Sign out now", () => {
    vi.useFakeTimers();
    mount();
    tick(1000);
    fireEvent.click(screen.getByRole("button", { name: "Sign out now" }));
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(push).toHaveBeenCalledTimes(1);
    tick(5000);
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe("OfflineStrip", () => {
  it("shows only while the browser is offline", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineStrip />);
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByRole("status")).toHaveTextContent(/You're offline/);
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });
});

describe("DegradedStrip", () => {
  it("warns when the service reports it is not fully ready", async () => {
    readiness.mockResolvedValueOnce({
      ok: false,
      degraded_services: ["retrieval"],
    });
    render(
      <Providers>
        <DegradedStrip />
      </Providers>,
    );
    expect(
      await screen.findByText(/Some services are running slowly/),
    ).toBeInTheDocument();
  });
  it("stays hidden when everything is ready", async () => {
    render(
      <Providers>
        <DegradedStrip />
      </Providers>,
    );
    await act(async () => {});
    expect(readiness).toHaveBeenCalled();
    expect(
      screen.queryByText(/Some services are running slowly/),
    ).not.toBeInTheDocument();
  });
});
