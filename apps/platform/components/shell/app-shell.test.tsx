import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import type { AnalysisStatus } from "@/lib/api/analysis-contract";
import type { User } from "@/lib/auth/types";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { AppShell } from "./app-shell";
import { TopBar } from "./top-bar";

const online = vi.hoisted(() => ({ value: true }));
vi.mock("@mhai/ui/hooks/use-online", () => ({ useOnline: () => online.value }));
const pathname = vi.hoisted(() => ({ value: "/hospitals" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
beforeEach(() => {
  pathname.value = "/hospitals";
  online.value = true;
});

const shell = (user?: User) =>
  renderWithAuth(
    <AppShell>
      <TopBar title="Hospitals" />
    </AppShell>,
    user ? { user } : {},
  );

describe("the platform shell", () => {
  it("the sidebar shows Platform and the links in order (Analysis waits for the status)", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    expect(within(nav).getByText("Platform")).toBeInTheDocument();
    const links = within(nav)
      .getAllByRole("link")
      .map((l) => [l.textContent, l.getAttribute("href")]);
    expect(links).toEqual([
      ["Hospitals", "/hospitals"],
      ["Connections", "/connections"],
      ["Usage", "/usage"],
      ["Clearances", "/clearances"],
      ["Legal holds", "/legal-holds"],
      ["System", "/system"],
      ["Settings", "/settings"],
      ["Team", "/team"],
      ["Activity", "/activity"],
      ["Audit log", "/audit"],
      ["Account", "/account"],
    ]);
  });

  it("the sidebar shows Audit log after Activity, and both roles see it", () => {
    for (const user of [undefined, AMARA]) {
      const { unmount } = shell(user);
      const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
      const names = within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent);
      expect(names[names.indexOf("Activity") + 1]).toBe("Audit log");
      expect(
        within(nav).getByRole("link", { name: "Audit log" }),
      ).toHaveAttribute("href", "/audit");
      unmount();
    }
  });

  it("the sidebar shows Legal holds between Clearances and System", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent);
    const at = names.indexOf("Legal holds");
    expect(names[at - 1]).toBe("Clearances");
    expect(names[at + 1]).toBe("System");
    expect(
      within(nav).getByRole("link", { name: "Legal holds" }),
    ).toHaveAttribute("href", "/legal-holds");
  });

  it("the sidebar shows Connections right after Hospitals", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent);
    expect(names[names.indexOf("Hospitals") + 1]).toBe("Connections");
    expect(
      within(nav).getByRole("link", { name: "Connections" }),
    ).toHaveAttribute("href", "/connections");
  });

  it("the sidebar shows Usage between Connections and Clearances, linking to /usage", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent);
    const at = names.indexOf("Usage");
    expect(names[at - 1]).toBe("Connections");
    expect(names[at + 1]).toBe("Clearances");
    expect(within(nav).getByRole("link", { name: "Usage" })).toHaveAttribute(
      "href",
      "/usage",
    );
  });

  it("a platform admin sees Analysis between Usage and Clearances, with Sample data, once the status is on", async () => {
    __setPlatformClientForTests(
      createMockPlatform({ delayMs: 0, me: () => ADA.email }),
    );
    pathname.value = "/analysis";
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const link = await within(nav).findByRole("link", { name: /^Analysis/ });
    expect(link).toHaveAttribute("href", "/analysis");
    expect(link).toHaveAttribute("aria-current", "page");
    expect(within(link).getByText("Sample data")).toBeInTheDocument();
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.getAttribute("href"));
    expect(names.slice(0, 5)).toEqual([
      "/hospitals",
      "/connections",
      "/usage",
      "/analysis",
      "/clearances",
    ]);
    __resetPlatformClientForTests();
  });

  it("an auditor never sees Analysis, and the status is never asked", async () => {
    const m = createMockPlatform({ delayMs: 0, me: () => AMARA.email });
    const status = vi.spyOn(m, "getAnalysisStatus");
    __setPlatformClientForTests(m);
    shell(AMARA);
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    await within(nav).findByRole("link", { name: "Usage" });
    expect(within(nav).queryByRole("link", { name: /^Analysis/ })).toBeNull();
    expect(status).not.toHaveBeenCalled();
    __resetPlatformClientForTests();
  });

  it("with the switch off, nobody sees Analysis", async () => {
    const m = createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      analysis: "off",
    });
    const status = vi.spyOn(m, "getAnalysisStatus");
    __setPlatformClientForTests(m);
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderWithAuth(
      <AppShell>
        <TopBar title="Hospitals" />
      </AppShell>,
      { queryClient: qc },
    );
    // The status has been read, and said off: not merely still loading.
    await waitFor(() =>
      expect(qc.getQueryState(["analysis", "status"])?.status).toBe("success"),
    );
    expect(
      (qc.getQueryData(["analysis", "status"]) as AnalysisStatus)
        .aggregates_enabled,
    ).toBe(false);
    expect(status).toHaveBeenCalledTimes(1);
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    expect(within(nav).queryByRole("link", { name: /^Analysis/ })).toBeNull();
    __resetPlatformClientForTests();
  });

  it("no sidebar entry says Analytics", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    expect(within(nav).queryByText(/Analytics/)).toBeNull();
  });

  it("the sidebar shows Clearances straight after Usage; active on /clearances", () => {
    pathname.value = "/clearances";
    for (const user of [undefined, AMARA]) {
      const { unmount } = shell(user);
      const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
      const names = within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent);
      const at = names.indexOf("Clearances");
      expect(names[at - 1]).toBe("Usage");
      expect(names[at + 1]).toBe("Legal holds");
      const link = within(nav).getByRole("link", { name: "Clearances" });
      expect(link).toHaveAttribute("href", "/clearances");
      expect(link).toHaveAttribute("aria-current", "page");
      unmount();
    }
  });

  it("System sits after Legal holds, before Settings; active on /system/jobs", () => {
    pathname.value = "/system/jobs";
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent);
    const at = names.indexOf("System");
    expect(names[at - 1]).toBe("Legal holds");
    expect(names[at + 1]).toBe("Settings");
    expect(within(nav).getByRole("link", { name: "System" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("Settings after System, before Team; active on /settings", () => {
    pathname.value = "/settings";
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent);
    const at = names.indexOf("Settings");
    expect(names[at - 1]).toBe("System");
    expect(names[at + 1]).toBe("Team");
    const link = within(nav).getByRole("link", { name: "Settings" });
    expect(link).toHaveAttribute("href", "/settings");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("the current page link has aria-current", () => {
    pathname.value = "/team";
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    expect(within(nav).getByRole("link", { name: "Team" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Hospitals" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("the top bar uses the platform header colour", () => {
    renderWithAuth(<TopBar title="Team" sub="Staff" />, { user: null });
    expect(screen.getByRole("banner")).toHaveClass("bg-bloom", "text-white");
    expect(screen.queryByRole("button", { name: /notif/i })).toBeNull();
  });

  it("a signed-in user sees the bell in the top bar", async () => {
    __setPlatformClientForTests(createMockPlatform({ delayMs: 0 }));
    renderWithAuth(<TopBar title="Team" />);
    expect(
      await screen.findByRole("button", { name: /^Notifications/ }),
    ).toBeInTheDocument();
    __resetPlatformClientForTests();
  });

  it("on a phone the menu button opens the drawer and Escape closes it", async () => {
    const user = userEvent.setup();
    shell();
    const drawer = () => document.querySelector('[role="dialog"]')!;
    expect(drawer().closest("[inert]")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    expect(drawer().closest("[inert]")).toBeNull();
    expect(drawer()).toHaveAttribute("aria-label", "Menu");
    await user.keyboard("{Escape}");
    expect(drawer().closest("[inert]")).not.toBeNull();
  });

  it("shows who is signed in and a Sign out link", async () => {
    const user = userEvent.setup();
    shell();
    await user.click(
      screen.getAllByRole("button", { name: /Account menu: Ada Bakare/ })[0]!,
    );
    expect(screen.getByRole("menuitem", { name: "Sign out" })).toHaveAttribute(
      "href",
      "/sign-out",
    );
  });

  it("Hospitals shows no integrity banner while the check is intact, and other pages never read it", async () => {
    const m = createMockPlatform({ delayMs: 0 });
    const read = vi.spyOn(m, "getIntegrityStatus");
    __setPlatformClientForTests(m);
    const { unmount } = shell();
    await waitFor(() => expect(read).toHaveBeenCalled());
    expect(
      screen.queryByText(/The audit log failed its integrity check/),
    ).toBeNull();
    unmount();
    read.mockClear();
    pathname.value = "/team";
    shell();
    await screen.findAllByRole("navigation", { name: "Platform" });
    expect(read).not.toHaveBeenCalled();
    __resetPlatformClientForTests();
  });

  it("the banners sit in order: offline strip, integrity, then health", async () => {
    online.value = false;
    __setPlatformClientForTests(
      createMockPlatform({
        delayMs: 0,
        me: () => ADA.email,
        audit: { integrity: "broken" },
        health: "problem",
      }),
    );
    shell();
    const integrity = await screen.findByText(
      /The audit log failed its integrity check/,
    );
    const health = await screen.findByText(/The service is having problems/);
    const strip = screen.getByRole("status");
    const before = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(strip).toHaveTextContent(/You're offline/);
    expect(before(strip, integrity)).toBe(true);
    expect(before(integrity, health)).toBe(true);
    __resetPlatformClientForTests();
  });
});
