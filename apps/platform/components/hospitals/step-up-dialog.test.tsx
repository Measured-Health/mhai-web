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
});
