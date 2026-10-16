import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { CodeInput, normalizeCode } from "./code-input";

function Harness() {
  const [v, setV] = useState("");
  return (
    <>
      <CodeInput value={v} onChange={setV} label="Code from your app" />
      <output data-testid="v">{v}</output>
    </>
  );
}
function FormHarness({
  autoSubmit,
  initial = "",
  onSubmit,
}: {
  autoSubmit?: boolean;
  initial?: string;
  onSubmit(code: string): void;
}) {
  const [v, setV] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <CodeInput
        autoSubmit={autoSubmit}
        value={v}
        onChange={setV}
        label="Code from your app"
      />
    </form>
  );
}
const box = (n: number) => screen.getByLabelText(`Digit ${n} of 6`);

describe("normalizeCode", () => {
  it.each([
    ["123 456", "123456"],
    ["123-456", "123456"],
    ["1234567", "123456"],
    ["12a3b4", "1234"],
    ["", ""],
  ])("%s → %s", (a, b) => expect(normalizeCode(a)).toBe(b));
});

describe("CodeInput", () => {
  it("advances as you type and backs up on Backspace", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("482");
    expect(screen.getByTestId("v")).toHaveTextContent("482");
    expect(box(4)).toHaveFocus();
    await user.keyboard("{Backspace}");
    expect(box(3)).toHaveFocus();
    expect(screen.getByTestId("v")).toHaveTextContent("48");
  });
  it("clears only a filled middle box on Backspace", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("482");
    await user.click(box(2));
    await user.keyboard("{Backspace}");
    expect(box(1)).toHaveValue("4");
    expect(box(2)).toHaveValue("");
    expect(box(3)).toHaveValue("2");
  });
  it("clears the previous box on Backspace in an empty one", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("482");
    await user.click(box(2));
    await user.keyboard("{Backspace}{Backspace}");
    expect(box(1)).toHaveValue("");
    expect(box(2)).toHaveValue("");
    expect(box(3)).toHaveValue("2");
    expect(box(1)).toHaveFocus();
  });
  it("does nothing on Backspace in an empty first box", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("{Backspace}");
    expect(box(1)).toHaveFocus();
    expect(screen.getByTestId("v")).toHaveTextContent("");
  });
  it("fills from a messy paste, first six digits only", () => {
    render(<Harness />);
    fireEvent.paste(box(3), {
      clipboardData: { getData: () => "12 34-56 7" },
    });
    expect(screen.getByTestId("v")).toHaveTextContent("123456");
  });
  it("ignores letters", async () => {
    render(<Harness />);
    await userEvent.type(box(1), "a");
    expect(screen.getByTestId("v")).toHaveTextContent("");
  });
  it("is a labelled group with one-time-code autocomplete", () => {
    render(<Harness />);
    expect(
      screen.getByRole("group", { name: "Code from your app" }),
    ).toBeInTheDocument();
    expect(box(1)).toHaveAttribute("autocomplete", "one-time-code");
    expect(box(2)).toHaveAttribute("inputmode", "numeric");
  });
  it("with autoSubmit, submits the full code once the sixth digit is typed", async () => {
    const onSubmit = vi.fn();
    render(<FormHarness autoSubmit onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("12345");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("6");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("123456");
  });
  it("with autoSubmit, submits a pasted code", () => {
    const onSubmit = vi.fn();
    render(<FormHarness autoSubmit onSubmit={onSubmit} />);
    fireEvent.paste(box(1), { clipboardData: { getData: () => "654 321" } });
    expect(onSubmit).toHaveBeenCalledWith("654321");
  });
  it("without autoSubmit, or with a code already filled in, waits for the button", async () => {
    const onSubmit = vi.fn();
    const { unmount } = render(<FormHarness onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.click(box(1));
    await user.keyboard("123456");
    unmount();
    render(<FormHarness autoSubmit initial="123456" onSubmit={onSubmit} />);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
