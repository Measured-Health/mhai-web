import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EXAMPLES } from "../states/first-visit";
import { HowItWorksPanel, YourQuestionPanel } from "./side-panels";

describe("HowItWorksPanel", () => {
  it("explains the four steps and fills the form from an example", async () => {
    const onExample = vi.fn();
    render(<HowItWorksPanel onExample={onExample} />);
    const panel = screen.getByRole("complementary", { name: "How it works" });
    expect(panel.querySelectorAll("ol > li")).toHaveLength(4);
    expect(screen.getByText("A good question")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Chest pain" }));
    expect(onExample).toHaveBeenCalledWith(
      EXAMPLES.find((e) => e.title === "Chest pain")!.v,
    );
  });
});

describe("YourQuestionPanel", () => {
  it("echoes the question as sent, in plain words", () => {
    render(
      <YourQuestionPanel
        query={{
          patient_data: {
            age: 54,
            sex: "male",
            symptoms: ["Chest pain", "Sweating"],
          },
          clinical_question: "Likely diagnosis and immediate management?",
          urgency: "urgent",
        }}
      />,
    );
    expect(
      screen.getByRole("complementary", { name: "Your question" }),
    ).toBeInTheDocument();
    expect(screen.getByText("54 · Male · Urgent")).toBeInTheDocument();
    expect(screen.getByText("Chest pain, Sweating")).toBeInTheDocument();
    expect(
      screen.getByText("Likely diagnosis and immediate management?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/appear here when the analysis finishes/),
    ).toBeInTheDocument();
  });
});
