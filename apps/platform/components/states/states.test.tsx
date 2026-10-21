import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CouldntLoad } from "./couldnt-load";
import { Empty } from "./empty";

describe("page states", () => {
  it("CouldntLoad calls onRetry", async () => {
    const onRetry = vi.fn();
    render(<CouldntLoad what="the hospitals" onRetry={onRetry} />);
    expect(
      screen.getByText("Couldn't load the hospitals."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("Empty shows its title and note", () => {
    render(<Empty title="No hospitals yet">Add one to begin.</Empty>);
    expect(screen.getByText("No hospitals yet")).toBeInTheDocument();
    expect(screen.getByText("Add one to begin.")).toBeInTheDocument();
  });
});
