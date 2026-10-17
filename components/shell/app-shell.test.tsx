import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import type { User } from "@/lib/auth/types";
import { TEST_USER } from "@/tests/auth-wrapper";
import { useDecisions } from "../corrections/decisions-provider";
import { AppShell, useShell } from "./app-shell";
import { TopBar } from "./top-bar";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push }),
}));

function Probe({ guard }: { guard?: (href: string) => boolean }) {
  const { navigate, setNavigationGuard } = useShell();
  useEffect(() => {
    setNavigationGuard(guard ?? null);
    return () => setNavigationGuard(null);
  }, [guard, setNavigationGuard]);
  return (
    <button type="button" onClick={() => navigate("/c/q1")}>
      go
    </button>
  );
}
const ui = (guard?: (href: string) => boolean) => (
  <Providers>
    <AppShell>
      <Probe guard={guard} />
    </AppShell>
  </Providers>
);

describe("useShell().navigate", () => {
  beforeEach(() => push.mockClear());
  it("pushes the route when no guard is set", async () => {
    render(ui());
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(push).toHaveBeenCalledWith("/c/q1");
  });
  it("pushes when the guard allows", async () => {
    const guard = vi.fn(() => true);
    render(ui(guard));
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(guard).toHaveBeenCalledWith("/c/q1");
    expect(push).toHaveBeenCalledWith("/c/q1");
  });
  it("blocks navigation when the guard returns false", async () => {
    const guard = vi.fn(() => false);
    render(ui(guard));
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    expect(guard).toHaveBeenCalledWith("/c/q1");
    expect(push).not.toHaveBeenCalled();
  });

  it("clears the guard when the component that set it unmounts", async () => {
    const guard = vi.fn(() => false);
    function Host() {
      const [on, setOn] = useState(true);
      return (
        <>
          <button onClick={() => setOn(false)}>unmount</button>
          {on && <Probe guard={guard} />}
          <Nav />
        </>
      );
    }
    function Nav() {
      const { navigate } = useShell();
      return <button onClick={() => navigate("/z")}>nav</button>;
    }
    render(
      <Providers>
        <AppShell>
          <Host />
        </AppShell>
      </Providers>,
    );
    await userEvent.click(screen.getByRole("button", { name: "nav" }));
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "unmount" }));
    await userEvent.click(screen.getByRole("button", { name: "nav" }));
    expect(push).toHaveBeenCalledWith("/z");
  });
});

describe("useShell outside AppShell", () => {
  it("still navigates via the router", async () => {
    push.mockClear();
    function Nav() {
      const { navigate } = useShell();
      return <button onClick={() => navigate("/y")}>nav</button>;
    }
    render(<Nav />);
    await userEvent.click(screen.getByRole("button", { name: "nav" }));
    expect(push).toHaveBeenCalledWith("/y");
  });
});

describe("useShell().openShortcuts", () => {
  it("opens the shortcuts dialog", async () => {
    function Keys() {
      const { openShortcuts } = useShell();
      return <button onClick={openShortcuts}>keys</button>;
    }
    render(
      <Providers>
        <AppShell>
          <Keys />
        </AppShell>
      </Providers>,
    );
    await userEvent.click(screen.getByRole("button", { name: "keys" }));
    expect(screen.getByRole("dialog", { name: /shortcuts/i })).toBeVisible();
  });
});

describe("AppShell by role", () => {
  beforeEach(() => push.mockClear());
  /** Reports whether the decisions context (bell, toasts, polling) is mounted. */
  function DecisionsProbe() {
    return <p>{useDecisions() ? "decisions on" : "decisions off"}</p>;
  }
  const shell = (user: User) =>
    render(
      <Providers auth={{ initialUser: user }}>
        <AppShell>
          <TopBar title="Staff" />
          <DecisionsProbe />
        </AppShell>
      </Providers>,
    );
  const keys = async () => {
    await userEvent.keyboard("?");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{Control>}k{/Control}");
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("n");
  };

  it("gives a clinician the shortcuts and the decision bell", async () => {
    shell(TEST_USER);
    expect(screen.getByText("decisions on")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", {
        name: /Decisions on your corrections/,
      }),
    ).toBeInTheDocument();
    await userEvent.keyboard("?");
    expect(
      await screen.findByRole("dialog", { name: /shortcuts/i }),
    ).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("n");
    expect(push).toHaveBeenCalledWith("/");
  });

  it("gives a hospital admin who isn't a clinician no shortcuts, search or decision bell (R3)", async () => {
    shell({ ...TEST_USER, roles: ["hospital_admin"] });
    expect(screen.getByRole("heading", { name: "Staff" })).toBeInTheDocument();
    expect(screen.getByText("decisions off")).toBeInTheDocument();
    await keys();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Decisions on your corrections/ }),
    ).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
