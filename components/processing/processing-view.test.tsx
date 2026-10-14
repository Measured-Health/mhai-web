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
  it("announces only the step in one polite status, never the elapsed time", () => {
    const { rerender, container } = render(
      <ProcessingView stage="retrieval" progress={0.2} elapsedMs={4200} />,
    );
    const status = screen.getByRole("status");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(status).toHaveTextContent(
      "Step 2 of 6: Searching medical guidelines",
    );
    expect(status.textContent).not.toMatch(/4\.2|\bs\b/);
    expect(container.querySelector("section")).not.toHaveAttribute("aria-live");
    rerender(
      <ProcessingView stage="decision" progress={0.9} elapsedMs={9100} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Step 6 of 6: Finalising recommendation",
    );
  });
  it("invents no time estimate", () => {
    const { container } = render(
      <ProcessingView stage="generation" progress={0.5} elapsedMs={4200} />,
    );
    const text = (container.textContent ?? "").replace("4.2 s", "");
    expect(text).not.toMatch(/seconds|usually takes|\d+\s*[–-]\s*\d+/i);
  });
  it("clamps bad progress and elapsed values", () => {
    render(
      <ProcessingView stage={null} progress={Number.NaN} elapsedMs={-5} />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByText("0.0 s")).toBeInTheDocument();
  });
});
