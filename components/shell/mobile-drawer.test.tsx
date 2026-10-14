import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
  it("keeps Tab and Shift+Tab inside and restores focus to the trigger", async () => {
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>outside</button>
          <MobileDrawer {...base} open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    render(<Host />);
    const outside = screen.getByRole("button", { name: "outside" });
    outside.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Menu" });
    for (const shift of [false, true]) {
      for (let i = 0; i < 20; i++) {
        await userEvent.tab({ shift });
        expect(outside).not.toHaveFocus();
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
      }
    }
    await userEvent.keyboard("{Escape}");
    expect(outside).toHaveFocus();
  });
});
