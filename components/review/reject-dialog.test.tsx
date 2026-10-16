import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RejectDialog } from "./reject-dialog";

const base = {
  open: true,
  onClose: vi.fn(),
  submitter: "Dr. Okafor",
  gone: false,
  busy: false,
  error: null,
  onSubmit: vi.fn(),
};
afterEach(() => {
  vi.unstubAllGlobals();
  base.onClose.mockReset();
  base.onSubmit.mockReset();
});

describe("RejectDialog", () => {
  it("needs a reason, and says so only when you try to send", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    expect(within(dialog).queryByText(/Choose a reason/)).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(within(dialog).getByText(/Choose a reason/)).toBeVisible();
    expect(within(dialog).getAllByRole("radio")[0]).toHaveFocus();
    expect(base.onSubmit).not.toHaveBeenCalled();
  });

  it("sends the reason and the trimmed note", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    await user.click(screen.getByRole("radio", { name: "Unsafe" }));
    await user.type(screen.getByLabelText("Note (optional)"), "  Too fast.  ");
    await user.click(
      screen.getByRole("button", { name: "Reject with reason" }),
    );
    expect(base.onSubmit).toHaveBeenCalledWith({
      reason_code: "unsafe",
      note: "Too fast.",
    });
  });

  it("leaves the note out when it's empty", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    await user.click(
      screen.getByRole("radio", { name: "Partly right, needs rewording" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Reject with reason" }),
    );
    expect(base.onSubmit).toHaveBeenCalledWith({
      reason_code: "needs_rewording",
    });
  });

  it("says the suggester will see it, and caps the note", () => {
    render(<RejectDialog {...base} />);
    expect(screen.getByText("Dr. Okafor will see your reason.")).toBeVisible();
    expect(screen.getByLabelText("Note (optional)")).toHaveAttribute(
      "maxlength",
      "500",
    );
    expect(screen.getByText("0 / 500")).toBeVisible();
  });

  it("closes on Esc and on Cancel", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    await user.keyboard("{Escape}");
    expect(base.onClose).toHaveBeenCalled();
    base.onClose.mockClear();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(base.onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open with the note when the correction is decided elsewhere (Review Focus 1)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RejectDialog {...base} />);
    await user.click(screen.getByRole("radio", { name: "Unsafe" }));
    await user.type(screen.getByLabelText("Note (optional)"), "Keep platelets");
    rerender(<RejectDialog {...base} gone />);
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(
      "Keep platelets",
    );
    const send = screen.getByRole("button", { name: "Reject with reason" });
    expect(send).toBeDisabled();
  });

  it("shows why sending failed and keeps what you typed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RejectDialog {...base} />);
    await user.type(screen.getByLabelText("Note (optional)"), "Kept");
    rerender(
      <RejectDialog
        {...base}
        error={{
          title: "Your rejection wasn't sent",
          body: "You're offline or the connection dropped.",
          gone: false,
          own: false,
        }}
      />,
    );
    expect(screen.getByText("Your rejection wasn't sent")).toBeVisible();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Kept");
  });

  it("is a bottom sheet on a phone", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      })),
    );
    render(<RejectDialog {...base} />);
    const sheet = screen.getByRole("dialog", { name: "Why reject this?" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(
      within(sheet).getByRole("button", { name: "Reject with reason" }),
    ).toBeVisible();
  });
});
