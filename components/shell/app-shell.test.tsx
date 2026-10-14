import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/app/providers";
import { AppShell, useShell } from "./app-shell";

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
});
