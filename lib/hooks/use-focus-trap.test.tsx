import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./use-focus-trap";

function Demo({ empty = false }: { empty?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(open, ref);
  return (
    <>
      <button onClick={() => setOpen(true)}>trigger</button>
      <button onClick={() => setOpen(false)}>closer</button>
      <div ref={ref} tabIndex={-1} data-testid="panel">
        {!empty && (
          <>
            <a href="/x">one</a>
            <textarea aria-label="note" />
            <select aria-label="pick">
              <option>a</option>
            </select>
          </>
        )}
      </div>
    </>
  );
}

describe("useFocusTrap", () => {
  it("focuses inside on open, keeps Tab and Shift+Tab inside, restores focus on close", async () => {
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "trigger" });
    trigger.focus();
    await userEvent.keyboard("{Enter}");
    const panel = screen.getByTestId("panel");
    expect(screen.getByRole("link", { name: "one" })).toHaveFocus();
    for (let i = 0; i < 8; i++) {
      await userEvent.tab();
      expect(panel).toContainElement(document.activeElement as HTMLElement);
    }
    for (let i = 0; i < 8; i++) {
      await userEvent.tab({ shift: true });
      expect(panel).toContainElement(document.activeElement as HTMLElement);
    }
    // textarea and select are reachable
    await userEvent.tab();
    expect(screen.getByLabelText("note")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByLabelText("pick")).toHaveFocus();
    // Close via the outside button's click handler (programmatic), focus returns to trigger
    await act(async () =>
      screen.getByRole("button", { name: "closer" }).click(),
    );
    expect(trigger).toHaveFocus();
  });
  it("focuses the panel itself when nothing inside is focusable", async () => {
    render(<Demo empty />);
    await act(async () =>
      screen.getByRole("button", { name: "trigger" }).click(),
    );
    expect(screen.getByTestId("panel")).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByTestId("panel")).toHaveFocus();
  });

  describe("a dialog opened on top", () => {
    function Panel() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(true, ref);
      return (
        <div ref={ref}>
          <button>inside</button>
        </div>
      );
    }
    const tabFromDialog = (modal: boolean) => {
      render(
        <>
          <Panel />
          <dialog open>
            <button>in dialog</button>
          </dialog>
        </>,
      );
      const dialog = document.querySelector("dialog")!;
      // jsdom has no top layer; say what a browser would for showModal().
      const real = dialog.matches.bind(dialog);
      dialog.matches = (q: string) => (q === ":modal" ? modal : real(q));
      const button = screen.getByRole("button", { name: "in dialog" });
      button.focus();
      const tab = new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(tab);
      return { tab, button };
    };

    it("is left to a modal dialog", () => {
      const { tab, button } = tabFromDialog(true);
      expect(tab.defaultPrevented).toBe(false);
      expect(button).toHaveFocus();
    });

    it("is not left to a non-modal one, which does not own the keyboard", () => {
      const { tab } = tabFromDialog(false);
      expect(tab.defaultPrevented).toBe(true);
      expect(screen.getByRole("button", { name: "inside" })).toHaveFocus();
    });
  });
});
