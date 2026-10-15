import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
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
});
