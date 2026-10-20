import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShortcutsDialog } from "./shortcuts-dialog";

describe("ShortcutsDialog", () => {
  it("lists the review shortcuts", () => {
    render(<ShortcutsDialog open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveTextContent("Approve correction (in review)A");
    expect(dialog).toHaveTextContent("Reject correction (in review)R");
  });
});
