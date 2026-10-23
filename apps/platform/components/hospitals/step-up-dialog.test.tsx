import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import { renderWithAuth } from "@/tests/render";
import { StepUpDialog } from "./step-up-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const base = {
  open: true,
  title: "Approve removal?",
  confirmLabel: "Approve",
  tone: "danger" as const,
  busy: false,
  error: null,
  onClose: () => {},
};

describe("StepUpDialog", () => {
  it("with no reason, focus goes to the code and it sends the code alone", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(<StepUpDialog {...base} onConfirm={onConfirm} />);
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getByLabelText("Digit 1 of 6")).toHaveFocus();
    await userEvent.keyboard("123456");
    // autoSubmit is off: nothing is sent until confirmed.
    expect(onConfirm).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).toHaveBeenCalledWith({ mfa_code: "123456" });
  });

  it("one confirmation sends once until the answer comes", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(<StepUpDialog {...base} onConfirm={onConfirm} />);
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    await userEvent.keyboard("123456");
    const btn = within(d).getByRole("button", { name: "Approve" });
    await userEvent.click(btn);
    await userEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a backup code is sent as backup_code; a wrong one says each works once", async () => {
    const onConfirm = vi.fn();
    // Refuses every code, as the API does a wrong one.
    function Host() {
      const [error, setError] = useState<unknown>(null);
      return (
        <StepUpDialog
          {...base}
          error={error}
          onConfirm={(input) => {
            onConfirm(input);
            setError(new ApiError(403, "mfa_invalid"));
          }}
        />
      );
    }
    renderWithAuth(<Host />);
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    await userEvent.click(
      within(d).getByRole("button", { name: "Use a backup code" }),
    );
    const input = within(d).getByLabelText("Backup code");
    await userEvent.type(input, "4f7k92qx");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).toHaveBeenCalledWith({ backup_code: "4F7K-92QX" });
    expect(
      within(d).getByText(/it may have been used already/),
    ).toBeInTheDocument();
    await waitFor(() => expect(input).toHaveValue(""));
    expect(input).toHaveFocus();
  });

  it("extra is required and sent back as extra", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(
      <StepUpDialog
        {...base}
        freeReason
        extra={{ label: "Lift authority", max: 200 }}
        onConfirm={onConfirm}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    await userEvent.type(within(d).getByLabelText(/^Reason/), "Case closed");
    const extra = within(d).getByLabelText(/^Lift authority/);
    expect(extra).toHaveAttribute("maxLength", "200");
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(within(d).getByText("Enter lift authority.")).toBeInTheDocument();
    expect(extra).toHaveFocus();
    expect(extra).toHaveAttribute("aria-invalid", "true");
    await userEvent.type(extra, "  Court order 12  ");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).toHaveBeenCalledWith({
      reason: "Case closed",
      extra: "Court order 12",
      mfa_code: "123456",
    });
  });

  it("an optional extra may be left empty and is then not sent", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(
      <StepUpDialog
        {...base}
        extra={{ label: "Reference (optional)", max: 60, required: false }}
        onConfirm={onConfirm}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    const extra = within(d).getByLabelText("Reference (optional)");
    // The first field still takes focus on open.
    expect(extra).toHaveFocus();
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).toHaveBeenCalledWith({ mfa_code: "123456" });
  });

  it("the hint shows under every free-text field", async () => {
    const hint =
      "Don't include patient names, hospital numbers or dates of birth.";
    renderWithAuth(
      <StepUpDialog
        {...base}
        reasons={[{ code: "other", label: "Other" }]}
        noteFor="other"
        extra={{ label: "Lift authority", max: 200 }}
        hint={hint}
        onConfirm={() => {}}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getAllByText(hint)).toHaveLength(2);
    for (const name of [/^Note/, /^Lift authority/])
      expect(within(d).getByLabelText(name)).toHaveAccessibleDescription(hint);
  });

  it("the hint shows under a free reason, and under extra after extra's own hint", async () => {
    const hint = "Don't include patient names.";
    renderWithAuth(
      <StepUpDialog
        {...base}
        freeReason
        extra={{ label: "Asked for by", max: 200, hint: "Who asked, by role." }}
        hint={hint}
        onConfirm={() => {}}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getByLabelText(/^Reason/)).toHaveAccessibleDescription(
      hint,
    );
    expect(
      within(d).getByLabelText(/^Asked for by/),
    ).toHaveAccessibleDescription(`Who asked, by role. ${hint}`);
  });

  it("noteMax limits the note and the free reason", () => {
    const { unmount } = renderWithAuth(
      <StepUpDialog
        {...base}
        reasons={[{ code: "other", label: "Other" }]}
        noteMax={200}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByLabelText(/^Note/)).toHaveAttribute("maxLength", "200");
    unmount();
    renderWithAuth(<StepUpDialog {...base} freeReason onConfirm={() => {}} />);
    expect(screen.getByLabelText(/^Reason/)).toHaveAttribute(
      "maxLength",
      "500",
    );
  });

  it("dismissLabel names the safe button", async () => {
    const onClose = vi.fn();
    const { unmount } = renderWithAuth(
      <StepUpDialog
        {...base}
        dismissLabel="Keep"
        onClose={onClose}
        onConfirm={() => {}}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(
      within(d).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(d).getByRole("button", { name: "Keep" }));
    expect(onClose).toHaveBeenCalled();
    unmount();
    renderWithAuth(<StepUpDialog {...base} onConfirm={() => {}} />);
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });
  it("noteMax and reference are passed through; the existing dialogs are unchanged", async () => {
    const onConfirm = vi.fn();
    const reasons = [
      { code: "legal_request", label: "Legal request" },
      { code: "other", label: "Other" },
    ];
    const { unmount } = renderWithAuth(
      <StepUpDialog
        {...base}
        reasons={reasons}
        noteFor="other"
        noteMax={200}
        extra={{ label: "Reference (optional)", max: 60, required: false }}
        onConfirm={onConfirm}
      />,
    );
    let d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getByLabelText(/^Note/)).toHaveAttribute(
      "maxLength",
      "200",
    );
    const ref = within(d).getByLabelText("Reference (optional)");
    expect(ref).toHaveAttribute("maxLength", "60");
    await userEvent.click(within(d).getByLabelText("Legal request"));
    await userEvent.type(ref, "  CASE-17 ");
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).toHaveBeenCalledWith({
      reason: "legal_request",
      extra: "CASE-17",
      mfa_code: "123456",
    });
    unmount();
    // Without them: no extra field, and the note keeps its 500.
    renderWithAuth(
      <StepUpDialog {...base} reasons={reasons} onConfirm={() => {}} />,
    );
    d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getByLabelText(/^Note/)).toHaveAttribute(
      "maxLength",
      "500",
    );
    expect(within(d).queryByLabelText(/Reference/)).not.toBeInTheDocument();
    expect(within(d).getByLabelText("Legal request")).not.toBeChecked();
  });

  it("initialReason starts with that reason chosen, and it can be changed", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(
      <StepUpDialog
        {...base}
        reasons={[
          { code: "legal_request", label: "Legal request" },
          { code: "security_investigation", label: "Security investigation" },
        ]}
        initialReason="security_investigation"
        onConfirm={onConfirm}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getByLabelText("Security investigation")).toBeChecked();
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(onConfirm).toHaveBeenLastCalledWith({
      reason: "security_investigation",
      mfa_code: "123456",
    });
  });
  it("an initialReason that isn't on offer starts with none chosen", async () => {
    const onConfirm = vi.fn();
    renderWithAuth(
      <StepUpDialog
        {...base}
        reasons={[{ code: "legal_request", label: "Legal request" }]}
        initialReason="made_up"
        onConfirm={onConfirm}
      />,
    );
    const d = screen.getByRole("dialog", { name: "Approve removal?" });
    expect(within(d).getByLabelText("Legal request")).not.toBeChecked();
    await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await userEvent.click(within(d).getByRole("button", { name: "Approve" }));
    expect(within(d).getByText("Choose a reason.")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
