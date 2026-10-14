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

describe("ConsultationForm focus and symptom rules", () => {
  async function fillStepZero(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/Age/), "54");
    await user.click(screen.getByRole("radio", { name: "Male" }));
    await user.click(screen.getByRole("radio", { name: /Urgent/ }));
  }

  it("switches to the step of the first error and focuses it", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ConsultationForm onSubmit={vi.fn()} />);
    await fillStepZero(user);
    await user.click(screen.getByRole("button", { name: /Analyse/ }));
    const symptoms = screen.getByLabelText(/Presenting symptoms/);
    expect(symptoms).toHaveFocus();
    expect(symptoms.closest("fieldset")).not.toHaveClass("max-md:hidden");
    expect(symptoms).toHaveAttribute("aria-invalid", "true");
    expect(symptoms).toHaveAttribute("aria-describedby", "e-symptoms");
  });

  it("moves focus when a summary link is activated", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ConsultationForm onSubmit={vi.fn()} />);
    await user.type(screen.getByLabelText(/Age/), "154");
    await user.click(screen.getByRole("button", { name: /Analyse/ }));
    await user.click(screen.getByRole("link", { name: /Clinical question/ }));
    const q = screen.getByLabelText(/Clinical question/);
    expect(q).toHaveFocus();
    expect(q.closest("fieldset")).not.toHaveClass("max-md:hidden");
    await user.click(screen.getByRole("link", { name: /^Sex/ }));
    expect(screen.getByRole("radio", { name: "Male" })).toHaveFocus();
    expect(screen.getByRole("radiogroup", { name: "Sex" })).toBeInTheDocument();
  });

  it("keeps the draft and says why at 20 symptoms, duplicates, and 200+ chars", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ConsultationForm onSubmit={vi.fn()} />);
    const box = screen.getByLabelText(/Presenting symptoms/);
    await user.type(box, "Fever{Enter}Fever{Enter}");
    expect(box).toHaveValue("Fever");
    expect(screen.getByText("Already added")).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "x".repeat(201));
    await user.keyboard("{Enter}");
    expect(box).toHaveValue("x".repeat(201));
    expect(
      screen.getByText("Keep each symptom to 200 characters or fewer"),
    ).toBeInTheDocument();
    await user.clear(box);
    for (let i = 0; i < 19; i++) await user.type(box, `s${i}{Enter}`);
    await user.type(box, "extra{Enter}");
    expect(box).toHaveValue("extra");
    expect(screen.getByText("Up to 20 symptoms")).toBeInTheDocument();
  });

  it("keeps focus on the first invalid field across repeated failed submits and replays the shake", async () => {
    const user = userEvent.setup({ delay: null });
    render(<ConsultationForm onSubmit={vi.fn()} />);
    const age = screen.getByLabelText(/Age/);
    await user.type(age, "154");
    const analyse = screen.getByRole("button", { name: /Analyse/ });
    await user.click(analyse);
    expect(screen.getByLabelText(/Age/)).toBe(age);
    expect(age).toHaveFocus();
    const wrapper = document.getElementById("f-age")!;
    expect(wrapper).toHaveClass("shake-once");
    await user.click(analyse);
    // Same element (never remounted by a key), still focused, shake replayed.
    expect(screen.getByLabelText(/Age/)).toBe(age);
    expect(age).toHaveFocus();
    expect(wrapper).toHaveClass("shake-once");
    expect(document.getElementById("f-specialty")).not.toHaveClass(
      "shake-once",
    );
  });
});
