import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfidencePill } from "./confidence-pill";
import { Button } from "./button";
import { Banner } from "./banner";
import { Dialog } from "./dialog";
import { Sheet } from "./sheet";
import { ToastProvider, useToast } from "./toast";

describe("ConfidencePill", () => {
  it("states the level in words and bars, not colour alone", () => {
    render(<ConfidencePill label="High confidence" bars={4} />);
    const pill = screen.getByRole("status", {
      name: "High confidence, 4 of 5 bars",
    });
    expect(pill).toHaveTextContent("High");
    expect(pill.querySelectorAll("[data-bar=on]")).toHaveLength(4);
  });
});

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
    const { rerender, container } = render(
      <Sheet open={false} onClose={onClose} title="Filters">
        <button>Apply</button>
      </Sheet>,
    );
    expect(container.firstElementChild).toHaveAttribute("inert");
    rerender(
      <Sheet open onClose={onClose} title="Filters">
        <button>Apply</button>
      </Sheet>,
    );
    expect(container.firstElementChild).not.toHaveAttribute("inert");
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
