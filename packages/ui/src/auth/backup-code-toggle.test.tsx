import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { BackupCodeInput } from "./backup-code-toggle";

function Field() {
  const [v, setV] = useState("");
  return <BackupCodeInput id="b" value={v} onChange={setV} />;
}

describe("BackupCodeInput", () => {
  it("never caps what is pasted, so spaces around a code can't cut it short", () => {
    render(<Field />);
    const box = screen.getByLabelText("Backup code");
    expect(box.getAttribute("maxlength")).toBeNull();
    fireEvent.change(box, { target: { value: "  PPPPP-QQQQQ \n" } });
    expect(box).toHaveProperty("value", "ppppp-qqqqq");
  });

  it("adds the dash to a code pasted without one", () => {
    render(<Field />);
    const box = screen.getByLabelText("Backup code");
    fireEvent.change(box, { target: { value: "ppppp qqqqq" } });
    expect(box).toHaveProperty("value", "ppppp-qqqqq");
  });
});
