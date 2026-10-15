import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithAuth, TEST_USER } from "@/tests/auth-wrapper";

const navigate = vi.fn();
const openShortcuts = vi.fn();
const closeDrawer = vi.fn();
vi.mock("./app-shell", () => ({
  useShell: () => ({ navigate, openShortcuts, closeDrawer }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { AccountMenu } from "./account-menu";

beforeEach(() => {
  navigate.mockClear();
  openShortcuts.mockClear();
  closeDrawer.mockClear();
});

describe("AccountMenu", () => {
  it("shows who is signed in and opens the menu", async () => {
    renderWithAuth(<AccountMenu rail={false} />);
    const button = screen.getByRole("button", { name: "Account: Dr. Reyes" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Havana Hospital")).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.getByRole("menu", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByText(TEST_USER.email!)).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Profile & security",
      "Keyboard shortcuts",
      "Help & guide",
      "Sign out",
    ]);
    expect(screen.getAllByRole("menuitem")[0]).toHaveFocus();
  });

  it("moves with arrow keys and closes on Esc, returning focus", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AccountMenu rail={false} />);
    const button = screen.getByRole("button", { name: /Account/ });
    await user.click(button);
    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("menuitem")[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getAllByRole("menuitem")[3]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("opens shortcuts, and signs out through the shell guard", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AccountMenu rail={false} />);
    await user.click(screen.getByRole("button", { name: /Account/ }));
    await user.click(
      screen.getByRole("menuitem", { name: "Keyboard shortcuts" }),
    );
    expect(openShortcuts).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: /Account/ }));
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(navigate).toHaveBeenCalledWith("/sign-out");
    expect(closeDrawer).toHaveBeenCalled();
  });

  it("is absent when nobody is signed in", () => {
    const { container } = renderWithAuth(<AccountMenu rail={false} />, null);
    expect(container).toBeEmptyDOMElement();
  });
});
