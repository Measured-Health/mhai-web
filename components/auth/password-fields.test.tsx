import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PasswordFields } from "./password-fields";

function Harness({ showErrors = false }: { showErrors?: boolean }) {
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <PasswordFields
      next={next}
      confirm={confirm}
      onNext={setNext}
      onConfirm={setConfirm}
      identity="a.reyes@havanahospital.org"
      showErrors={showErrors}
    />
  );
}

describe("PasswordFields", () => {
  it("ticks rules as you type, in words not just colour", async () => {
    render(<Harness />);
    const rule = () =>
      screen.getByText("At least 12 characters").closest("li")!;
    expect(rule()).toHaveAccessibleName(/not met/);
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    expect(rule()).toHaveAccessibleName(/met/);
    expect(rule()).not.toHaveAccessibleName(/not met/);
  });
  it("shows the mismatch only once errors are on", async () => {
    const { rerender } = render(<Harness />);
    await userEvent.type(
      screen.getByLabelText("New password"),
      "tram-lantern-okra",
    );
    await userEvent.type(screen.getByLabelText("Confirm password"), "tram");
    expect(screen.queryByText("The passwords don't match.")).toBeNull();
    rerender(<Harness showErrors />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The passwords don't match.",
    );
  });
  it("uses password inputs with the right autocomplete", () => {
    render(<Harness />);
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
      "type",
      "password",
    );
  });
});
