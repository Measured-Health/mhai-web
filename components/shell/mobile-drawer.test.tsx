import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MobileDrawer } from "./mobile-drawer";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const base = { items: [], onClose() {}, onOpenSearch() {} };

describe("MobileDrawer", () => {
  it("is inert and hidden from assistive tech while closed", () => {
    const { container } = render(<MobileDrawer {...base} open={false} />);
    expect(container.firstElementChild).toHaveAttribute("inert");
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
  it("is interactive when open, focuses inside, and closes on Escape", async () => {
    const onClose = vi.fn();
    const { container } = render(
      <MobileDrawer {...base} onClose={onClose} open />,
    );
    expect(container.firstElementChild).not.toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Menu" })).toContainElement(
      document.activeElement as HTMLElement,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
  it("traps Tab inside the drawer", async () => {
    render(<MobileDrawer {...base} open />);
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    for (let i = 0; i < 30; i++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
  });
});
