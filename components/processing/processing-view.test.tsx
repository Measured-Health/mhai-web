import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessingView } from "./processing-view";

describe("ProcessingView", () => {
  it("marks earlier steps done, the current one active, and later ones to do", () => {
    render(
      <ProcessingView stage="generation" progress={2 / 6} elapsedMs={4200} />,
    );
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((s) => s.getAttribute("data-state"))).toEqual([
      "done",
      "done",
      "active",
      "todo",
      "todo",
      "todo",
    ]);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
  });
  it("shows step count, percent from the API, and elapsed time only", () => {
    render(
      <ProcessingView stage="generation" progress={0.58} elapsedMs={4200} />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "58",
    );
    expect(screen.getByText("Step 3 of 6")).toBeInTheDocument();
    expect(screen.getByText("4.2 s")).toBeInTheDocument();
  });
  it("treats a null stage before start as the first step", () => {
    render(<ProcessingView stage={null} progress={0} elapsedMs={0} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Step 1 of 6")).toBeInTheDocument();
  });
});
