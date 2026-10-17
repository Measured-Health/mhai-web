import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOAST_MAX, ToastProvider, useToast, type ToastInput } from "./toast";

const box = {} as { api: ReturnType<typeof useToast> };
function Grab() {
  const t = useToast();
  useEffect(() => {
    box.api = t;
  });
  return <button type="button">elsewhere</button>;
}
const ui = () =>
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  );
const polite = () => document.querySelector('[aria-live="polite"]')!;
const assertive = () => document.querySelector('[aria-live="assertive"]')!;
const popup = (o: Partial<ToastInput> = {}): ToastInput => ({
  title: "Urgent patient alert",
  body: "Emeka Nnamdi · Platelets 62",
  live: "polite",
  severity: "urgent",
  ms: 12_000,
  tag: "notifications",
  action: {
    label: "View",
    name: "View alert for Emeka Nnamdi",
    onClick: vi.fn(),
  },
  ...o,
});
afterEach(() => vi.useRealTimers());

describe("Toast pop-ups", () => {
  it("keeps plain toasts as they were", () => {
    vi.useFakeTimers();
    ui();
    act(() => {
      box.api.show({ title: "Copied", ms: 1000 });
    });
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(screen.queryByRole("button", { name: /Hide pop-up/ })).toBeNull();
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Copied")).toBeNull();
  });

  it("reads a pop-up out politely, without moving focus", () => {
    ui();
    screen.getByRole("button", { name: "elsewhere" }).focus();
    act(() => {
      box.api.show(popup());
    });
    expect(screen.getByText("Urgent patient alert")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    expect(polite()).toHaveTextContent(
      "Urgent patient alert. Emeka Nnamdi · Platelets 62",
    );
    expect(assertive()).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "elsewhere" })).toHaveFocus();
  });

  it("reads Critical out assertively and keeps it until hidden", () => {
    vi.useFakeTimers();
    ui();
    act(() => {
      box.api.show(
        popup({
          title: "Critical patient alert",
          live: "assertive",
          severity: "critical",
          ms: null,
        }),
      );
    });
    expect(assertive()).toHaveTextContent("Critical patient alert");
    act(() => vi.advanceTimersByTime(10 * 60_000));
    expect(screen.getByText("Critical patient alert")).toBeVisible();
    act(() =>
      screen
        .getByRole("button", {
          name: "Hide pop-up: Critical patient alert, Emeka Nnamdi · Platelets 62",
        })
        .click(),
    );
    expect(screen.queryByText("Critical patient alert")).toBeNull();
  });

  it("runs View and hides the pop-up", async () => {
    const onClick = vi.fn();
    ui();
    act(() => {
      box.api.show(
        popup({
          action: {
            label: "View",
            name: "View alert for Emeka Nnamdi",
            onClick,
          },
        }),
      );
    });
    await userEvent.click(
      screen.getByRole("button", { name: "View alert for Emeka Nnamdi" }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Urgent patient alert")).toBeNull();
  });

  it("keeps at most TOAST_MAX on screen, dropping the oldest that can expire (Review Focus 3)", () => {
    ui();
    act(() => {
      box.api.show(
        popup({
          title: "Critical 1",
          ms: null,
          live: "assertive",
          severity: "critical",
        }),
      );
      for (let i = 1; i <= 5; i++)
        box.api.show(popup({ title: `Urgent ${i}` }));
    });
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(TOAST_MAX);
    expect(screen.getByText("Critical 1")).toBeVisible();
    expect(screen.queryByText("Urgent 1")).toBeNull();
    expect(screen.queryByText("Urgent 2")).toBeNull();
    expect(screen.getByText("Urgent 5")).toBeVisible();
  });

  it("clears a tag's pop-ups and the live text (Review Focus 5)", () => {
    ui();
    act(() => {
      box.api.show({ title: "Saved", ms: 60_000 });
      box.api.show(
        popup({
          title: "Critical patient alert",
          body: "Halima Garba · Potassium 6.7",
          live: "assertive",
          ms: null,
        }),
      );
    });
    act(() => box.api.clear("notifications"));
    expect(screen.queryByText("Critical patient alert")).toBeNull();
    expect(document.body.textContent).not.toContain("Halima Garba");
    expect(screen.getByText("Saved")).toBeVisible();
    expect(assertive()).toBeEmptyDOMElement();
    expect(polite()).toBeEmptyDOMElement();
  });

  it("removes the live text with its toast when dismissed (A10)", () => {
    ui();
    let id = 0;
    act(() => {
      id = box.api.show(popup({ body: "Emeka Nnamdi · Platelets 62" }));
    });
    expect(polite()).toHaveTextContent("Emeka Nnamdi");
    act(() => box.api.dismiss(id));
    expect(polite()).toBeEmptyDOMElement();
    expect(document.body.textContent).not.toContain("Emeka Nnamdi");
  });

  it("removes the live text when the toast expires (A10)", () => {
    vi.useFakeTimers();
    ui();
    act(() => {
      box.api.show(popup({ ms: 1000 }));
    });
    expect(polite()).toHaveTextContent("Emeka Nnamdi");
    act(() => vi.advanceTimersByTime(1100));
    expect(polite()).toBeEmptyDOMElement();
  });

  it("keeps another toast's live text when a different one goes (A10)", () => {
    ui();
    let first = 0;
    act(() => {
      first = box.api.show(popup({ title: "First", body: "Halima Garba" }));
      box.api.show(popup({ title: "Second", body: "Emeka Nnamdi" }));
    });
    act(() => box.api.dismiss(first));
    expect(polite()).toHaveTextContent("Emeka Nnamdi");
  });

  it("shows the new plain toast and drops the oldest non-critical when full of persistent ones (A11)", () => {
    ui();
    act(() => {
      for (let i = 1; i <= 4; i++)
        box.api.show(popup({ title: `Keep ${i}`, ms: null }));
      box.api.show(popup({ title: "Plain" }));
    });
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(TOAST_MAX);
    expect(screen.getByText("Plain")).toBeVisible();
    expect(screen.queryByText("Keep 1")).toBeNull();
    expect(screen.getByText("Keep 2")).toBeVisible();
  });

  it("never drops a Critical, even over the cap (A11)", () => {
    ui();
    const crit = (n: number) =>
      popup({
        title: `Crit ${n}`,
        ms: null,
        severity: "critical",
        live: "assertive",
      });
    act(() => {
      for (let i = 1; i <= 5; i++) box.api.show(crit(i));
    });
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(5);
  });

  it("shows a plain toast even when 4 Criticals are up (A11)", () => {
    ui();
    act(() => {
      for (let i = 1; i <= 4; i++)
        box.api.show(
          popup({
            title: `Crit ${i}`,
            ms: null,
            severity: "critical",
            live: "assertive",
          }),
        );
      box.api.show(popup({ title: "Plain" }));
    });
    expect(screen.getByText("Plain")).toBeVisible();
    expect(screen.getByText("Crit 1")).toBeVisible();
    expect(document.querySelectorAll("[data-toast]")).toHaveLength(5);
  });

  it("clears every timer on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = ui();
    act(() => {
      box.api.show(popup({ ms: 5000 }));
      box.api.show(popup({ ms: 9000 }));
    });
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels a toast's timer when it is dismissed", () => {
    vi.useFakeTimers();
    ui();
    let id = 0;
    act(() => {
      id = box.api.show(popup({ ms: 5000 }));
      box.api.show(popup({ ms: 9000 }));
    });
    expect(vi.getTimerCount()).toBe(2);
    act(() => box.api.dismiss(id));
    expect(vi.getTimerCount()).toBe(1);
  });

  it("tells same-title pop-ups apart by their body", () => {
    ui();
    act(() => {
      box.api.show(popup({ body: "Halima Garba" }));
      box.api.show(popup({ body: "Emeka Nnamdi" }));
    });
    expect(
      screen.getByRole("button", {
        name: "Hide pop-up: Urgent patient alert, Halima Garba",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Hide pop-up: Urgent patient alert, Emeka Nnamdi",
      }),
    ).toBeVisible();
  });
});

describe("Toast printing (B4)", () => {
  it("keeps pop-ups off paper: the whole viewport is print:hidden", () => {
    ui();
    act(() => {
      box.api.show(popup());
    });
    const viewport = document.querySelector("[data-toast]")!.parentElement!;
    expect(viewport).toHaveClass("print:hidden");
  });
});
