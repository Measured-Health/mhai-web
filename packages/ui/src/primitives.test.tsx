import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useRef, useState } from "react";
import { Button } from "./button";
import { Banner } from "./banner";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";
import { Switch } from "./switch";
import { ToastProvider, useToast } from "./toast";

describe("Banner", () => {
  it("is announced as an alert when it is a safety banner", () => {
    render(
      <Banner tone="bad" title="Needs review">
        Text
      </Banner>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Needs review");
  });
});

describe("Dialog", () => {
  it("closes on Escape and moves focus inside", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Discard this draft?">
        <button>Keep editing</button>
      </Dialog>,
    );
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Keep editing")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("can give the first focus to a chosen element over an earlier input", () => {
    function Ask() {
      const keep = useRef<HTMLButtonElement>(null);
      return (
        <Dialog
          open
          onClose={() => {}}
          title="Remove this account?"
          initialFocus={keep}
        >
          <input aria-label="Code" />
          <button ref={keep}>Keep account</button>
        </Dialog>
      );
    }
    render(<Ask />);
    expect(screen.getByText("Keep account")).toHaveFocus();
  });

  it("keeps its width unless a className is given, which replaces it", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Narrow">
        <button>Ok</button>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("w-[min(440px,92vw)]");
    rerender(
      <Dialog
        open
        onClose={() => {}}
        title="Narrow"
        className="w-full print:hidden"
      >
        <button>Ok</button>
      </Dialog>,
    );
    const d = screen.getByRole("dialog");
    expect(d).toHaveClass("w-full", "print:hidden");
    expect(d).not.toHaveClass("w-[min(440px,92vw)]");
  });
});

describe("Dialog focus return (Plan 11 Task 6, I1)", () => {
  function Opener({ unmount }: { unmount: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open it</button>
        <button>Elsewhere</button>
        {(open || !unmount) && (
          <Dialog open={open} onClose={() => setOpen(false)} title="Asked">
            <button onClick={() => setOpen(false)}>Done</button>
          </Dialog>
        )}
      </>
    );
  }

  it("gives the focus back to its opener when unmounted while open", async () => {
    render(<Opener unmount />);
    await userEvent.click(screen.getByText("Open it"));
    expect(screen.getByText("Done")).toHaveFocus();
    await userEvent.click(screen.getByText("Done"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Open it")).toHaveFocus();
  });

  it("gives the focus back to its opener when closed", async () => {
    render(<Opener unmount={false} />);
    await userEvent.click(screen.getByText("Open it"));
    expect(screen.getByText("Done")).toHaveFocus();
    await userEvent.click(screen.getByText("Done"));
    expect(screen.getByRole("dialog", { hidden: true })).not.toHaveAttribute(
      "open",
    );
    expect(screen.getByText("Open it")).toHaveFocus();
  });

  it("moves no focus when the opener has gone", () => {
    function Gone() {
      const [step, setStep] = useState<"button" | "dialog" | "none">("button");
      return (
        <>
          <button>Stays</button>
          {step === "button" && (
            <button onClick={() => setStep("dialog")}>Open it</button>
          )}
          {step === "dialog" && (
            <Dialog open onClose={() => {}} title="Asked">
              <button onClick={() => setStep("none")}>Done</button>
            </Dialog>
          )}
        </>
      );
    }
    render(<Gone />);
    act(() => screen.getByText("Open it").focus());
    act(() => screen.getByText("Open it").click());
    act(() => screen.getByText("Done").click());
    expect(screen.queryByText("Open it")).toBeNull();
    expect(screen.getByText("Stays")).not.toHaveFocus();
  });
});

describe("Toast", () => {
  it("shows and auto-dismisses", () => {
    vi.useFakeTimers();
    function Fire() {
      const t = useToast();
      return (
        <button onClick={() => t.show({ title: "Copied", ms: 1000 })}>
          go
        </button>
      );
    }
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    act(() => screen.getByText("go").click());
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Copied")).toBeNull();
    vi.useRealTimers();
  });
});

describe("Toast placement", () => {
  it("sits below the top bar and the demo ribbon (offset by --demo-h)", () => {
    const { container } = render(
      <ToastProvider>
        <p>x</p>
      </ToastProvider>,
    );
    const stack = container.querySelector(".fixed")!;
    expect(stack.className).toContain("top-[calc(var(--demo-h,0px)+4.75rem)]");
    expect(stack.className).not.toMatch(/(^|\s)top-5(\s|$)/);
  });
});

describe("Dialog (preflight R1, R2)", () => {
  it("gives each dialog its own accessible name and closes without throwing", () => {
    const { rerender } = render(
      <>
        <Dialog open onClose={() => {}} title="First">
          <button>a</button>
        </Dialog>
        <Dialog open onClose={() => {}} title="Second">
          <button>b</button>
        </Dialog>
      </>,
    );
    expect(screen.getByRole("dialog", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Second" })).toBeInTheDocument();
    expect(() =>
      rerender(
        <>
          <Dialog open={false} onClose={() => {}} title="First">
            <button>a</button>
          </Dialog>
          <Dialog open={false} onClose={() => {}} title="Second">
            <button>b</button>
          </Dialog>
        </>,
      ),
    ).not.toThrow();
  });
});

describe("Sheet (preflight R3)", () => {
  it("is inert when closed and closes on Escape when open", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet open={false} onClose={onClose} title="Filters">
        <button>Apply</button>
      </Sheet>,
    );
    const root = () =>
      screen.getByRole("dialog", { hidden: true }).parentElement!;
    expect(root()).toHaveAttribute("inert");
    rerender(
      <Sheet open onClose={onClose} title="Filters">
        <button>Apply</button>
      </Sheet>,
    );
    expect(root()).not.toHaveAttribute("inert");
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps Tab focus inside while open", async () => {
    render(
      <>
        <button>outside</button>
        <Sheet open onClose={() => {}} title="Filters">
          <button>Apply</button>
        </Sheet>
      </>,
    );
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(screen.getByRole("dialog")).toContainElement(
        document.activeElement as HTMLElement,
      );
    }
  });
});

describe("Sheet portal", () => {
  it("renders under document.body, outside its parent, with the root class", () => {
    const { container } = render(
      <div className="card" style={{ backdropFilter: "blur(18px)" }}>
        <Sheet open onClose={() => {}} title="Filters" className="print:hidden">
          <button>Apply</button>
        </Sheet>
      </div>,
    );
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const root = dialog.parentElement!;
    expect(root.parentElement).toBe(document.body);
    expect(container).not.toContainElement(dialog);
    expect(root).toHaveClass("fixed", "inset-0", "print:hidden");
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("puts the side panel under document.body too", () => {
    render(
      <div>
        <Sheet side="right" open onClose={() => {}} title="Staff member">
          <button>Save</button>
        </Sheet>
      </div>,
    );
    const dialog = screen.getByRole("dialog", { name: "Staff member" });
    expect(dialog.parentElement!.parentElement).toBe(document.body);
  });
});

describe("Sheet side panel", () => {
  it("is a dialog from the right, mounted only while open, with a 44 px Close", async () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <Sheet side="right" open={false} onClose={onClose} title="Staff member">
        <button>Save</button>
      </Sheet>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(
      <Sheet side="right" open onClose={onClose} title="Staff member">
        <button>Save</button>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Staff member" });
    const close = screen.getByRole("button", { name: "Close" });
    expect(close.className).toMatch(/size-11/);
    expect(close).toHaveFocus();
    expect(dialog.className).toMatch(/md:right-0/);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("leaves Esc to a modal dialog opened on top", async () => {
    const onClose = vi.fn();
    render(
      <>
        <Sheet side="right" open onClose={onClose} title="Staff member">
          <button>Save</button>
        </Sheet>
        <dialog open>
          <button>Confirm</button>
        </dialog>
      </>,
    );
    const d = document.querySelector("dialog")!;
    d.matches = (q: string) => q === ":modal";
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("Button", () => {
  it("defaults to type=button so it never submits a form, but can be overridden", () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Plain</Button>
        <Button type="submit">Send</Button>
      </form>,
    );
    expect(screen.getByText("Plain")).toHaveAttribute("type", "button");
    expect(screen.getByText("Send")).toHaveAttribute("type", "submit");
  });
});

describe("Switch", () => {
  it("says On or Off in words, and can be described and disabled", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <>
        <Switch
          label="Pop-ups for patient alerts"
          checked
          onChange={onChange}
          describedBy="hint"
        />
        <p id="hint">Critical alerts will still pop up.</p>
      </>,
    );
    const sw = screen.getByRole("switch", {
      name: "Pop-ups for patient alerts",
    });
    expect(sw).toBeChecked();
    expect(sw).toHaveAccessibleDescription(
      "Critical alerts will still pop up.",
    );
    expect(screen.getByText("On")).toBeInTheDocument();
    await userEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(false);
    rerender(
      <Switch
        label="Pop-ups for patient alerts"
        checked={false}
        onChange={onChange}
        disabled
      />,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });
});
