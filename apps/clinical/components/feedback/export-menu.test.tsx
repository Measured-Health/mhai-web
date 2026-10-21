import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { parseBody } from "../result/parse-body";
import { ToastProvider } from "@mhai/ui/toast";
import { ExportMenu, type ExportMenuHandle } from "./export-menu";

const r = FIXTURES.high;
const ui = () =>
  render(
    <ToastProvider>
      <button>outside</button>
      <ExportMenu
        queryId="q1"
        view={toResultView(r)}
        parsed={parseBody(r.response_text, r.citations)}
      />
    </ToastProvider>,
  );
const writeText = vi.fn();
function clipboard(fail: boolean) {
  writeText.mockReset();
  writeText.mockImplementation(() =>
    fail ? Promise.reject(new Error("denied")) : Promise.resolve(),
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}
const trigger = () =>
  screen.getByRole("button", { name: "More export options" });

afterEach(() => vi.restoreAllMocks());

describe("ExportMenu", () => {
  it("exposes menu semantics and focuses the first item on open", async () => {
    clipboard(false);
    ui();
    expect(trigger()).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("menuitem", { name: /Copy as text/ }),
    ).toHaveFocus();
  });
  it("moves with arrow keys, Home and End", async () => {
    clipboard(false);
    ui();
    await userEvent.click(trigger());
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitem", { name: /Print/ })).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("menuitem", { name: /ICD-10/ })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(
      screen.getByRole("menuitem", { name: /Copy as text/ }),
    ).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("menuitem", { name: /ICD-10/ })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(
      screen.getByRole("menuitem", { name: /Copy as text/ }),
    ).toHaveFocus();
  });
  it("Esc closes and returns focus to the trigger", async () => {
    clipboard(false);
    ui();
    await userEvent.click(trigger());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
  });
  it("closes on outside click and when Tab leaves the menu", async () => {
    clipboard(false);
    ui();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByText("outside"));
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(trigger());
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("shows a failure toast when copying fails, success toast otherwise", async () => {
    clipboard(true);
    ui();
    await userEvent.click(screen.getByRole("button", { name: /^Copy$/ }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
  });
  it("copies the ICD-10 code and reports the result honestly", async () => {
    clipboard(false);
    const a = ui();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: /ICD-10/ }));
    expect(writeText).toHaveBeenCalledWith("I20.0");
    expect(await screen.findByText("ICD-10 code copied")).toBeInTheDocument();
    a.unmount();
    clipboard(true);
    ui();
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("menuitem", { name: /ICD-10/ }));
    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
    expect(screen.queryByText("ICD-10 code copied")).toBeNull();
  });
  it("copy() on the handle copies the result as text", async () => {
    clipboard(false);
    const h = createRef<ExportMenuHandle>();
    render(
      <ToastProvider>
        <ExportMenu
          ref={h}
          queryId="q1"
          view={toResultView(r)}
          parsed={parseBody(r.response_text, r.citations)}
        />
      </ToastProvider>,
    );
    await act(async () => h.current?.copy());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(toResultView(r).title);
  });
});
