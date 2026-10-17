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
      "My feedback & corrections",
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
    expect(screen.getAllByRole("menuitem")[4]).toHaveFocus();
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

  it("links to My feedback & corrections", async () => {
    const user = userEvent.setup();
    renderWithAuth(<AccountMenu rail={false} />);
    await user.click(screen.getByRole("button", { name: /Account/ }));
    expect(
      screen.getByRole("menuitem", { name: "My feedback & corrections" }),
    ).toHaveAttribute("href", "/my-feedback");
  });

  it("is absent when nobody is signed in", () => {
    const { container } = renderWithAuth(<AccountMenu rail={false} />, null);
    expect(container).toBeEmptyDOMElement();
  });

  it("gives an admin-only person only their account and sign out", async () => {
    renderWithAuth(<AccountMenu rail={false} />, {
      ...TEST_USER,
      displayName: "Grace Nwosu",
      fullName: "Grace Nwosu",
      roleTitle: "Hospital IT lead",
      specialty: null,
      roles: ["hospital_admin"],
    });
    expect(
      screen.getByText("Hospital IT lead · Hospital admin"),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Account: Grace Nwosu" }),
    );
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Profile & security",
      "Sign out",
    ]);
  });

  it("shows a medical director's admin role in the footer", () => {
    renderWithAuth(<AccountMenu rail={false} />, {
      ...TEST_USER,
      roleTitle: "Medical director",
      roles: ["clinician", "hospital_admin"],
    });
    expect(
      screen.getByText("Medical director · Hospital admin"),
    ).toBeInTheDocument();
  });
});
