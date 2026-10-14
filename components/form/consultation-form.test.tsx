import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConsultationForm } from "./consultation-form";

describe("ConsultationForm", () => {
  it("shows an error summary, keeps input, and focuses the first error", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    render(<ConsultationForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Age/), "154");
    await user.click(screen.getByRole("button", { name: /Analyse/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/need fixing/);
    expect(screen.getByLabelText(/Age/)).toHaveValue("154");
    expect(screen.getByLabelText(/Age/)).toHaveFocus();
    const field = document.getElementById("f-age")!;
    expect(within(field).getByText("✕ Must be 0–120")).toBeInTheDocument();
  });

  it("submits a valid form with ⌘/Ctrl+Enter", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    render(<ConsultationForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/Age/), "54");
    await user.click(screen.getByRole("radio", { name: "Male" }));
    await user.click(screen.getByRole("radio", { name: /Urgent/ }));
    await user.type(
      screen.getByLabelText(/Presenting symptoms/),
      "Chest pain{Enter}",
    );
    await user.type(
      screen.getByLabelText(/Clinical question/),
      "Chest pain 40 min, BP 150/95. Diagnosis?",
    );
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: "urgent",
        clinical_question: "Chest pain 40 min, BP 150/95. Diagnosis?",
      }),
    );
  });

  it("offers an Unknown sex option", () => {
    render(<ConsultationForm onSubmit={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Unknown" })).toBeInTheDocument();
  });

  it("keeps a pasted long question and shows its length", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ConsultationForm onSubmit={vi.fn()} />);
    const q = screen.getByLabelText(/Clinical question/);
    await user.click(q);
    await user.paste("y".repeat(2050));
    expect(q).toHaveValue("y".repeat(2050));
    expect(screen.getByText("2050 / 2000")).toBeInTheDocument();
  });

  it("reports dirty state so the page can guard unsaved drafts", async () => {
    const user = userEvent.setup({ delay: null });
    const onDirty = vi.fn();
    render(<ConsultationForm onSubmit={vi.fn()} onDirtyChange={onDirty} />);
    await user.type(screen.getByLabelText(/Age/), "5");
    expect(onDirty).toHaveBeenLastCalledWith(true);
  });
});
