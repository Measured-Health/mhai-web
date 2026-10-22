import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "@/tests/render";
import { AppShell } from "./app-shell";
import { TopBar } from "./top-bar";

const pathname = vi.hoisted(() => ({ value: "/hospitals" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
beforeEach(() => {
  pathname.value = "/hospitals";
});

const shell = () =>
  renderWithAuth(
    <AppShell>
      <TopBar title="Hospitals" />
    </AppShell>,
  );

describe("the platform shell", () => {
  it("the sidebar shows Platform and the five links in order", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    expect(within(nav).getByText("Platform")).toBeInTheDocument();
    const links = within(nav)
      .getAllByRole("link")
      .map((l) => [l.textContent, l.getAttribute("href")]);
    expect(links).toEqual([
      ["Hospitals", "/hospitals"],
      ["Analytics", "/analytics"],
      ["Team", "/team"],
      ["Activity", "/activity"],
      ["Account", "/account"],
    ]);
  });

  it("the sidebar shows Analytics between Hospitals and Team", () => {
    shell();
    const nav = screen.getAllByRole("navigation", { name: "Platform" })[0]!;
    const names = within(nav)
      .getAllByRole("link")
      .map((l) => l.textContent);
    const at = names.indexOf("Analytics");
    expect(names[at - 1]).toBe("Hospitals");
    expect(names[at + 1]).toBe("Team");
    expect(
      within(nav).getByRole("link", { name: "Analytics" }),
    ).toHaveAttribute("href", "/analytics");
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
    render(<TopBar title="Team" sub="Staff" />);
    expect(screen.getByRole("banner")).toHaveClass("bg-bloom", "text-white");
    expect(screen.queryByRole("button", { name: /notif/i })).toBeNull();
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
});
