import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  MISSING_CONSULTATION,
  MISSING_PAGE,
  NotFoundState,
} from "./not-found-state";

describe("NotFoundState", () => {
  it("says what was missing and links home", () => {
    render(<NotFoundState message={MISSING_PAGE} />);
    expect(
      screen.getByRole("heading", { name: "We can't find that" }),
    ).toBeInTheDocument();
    expect(screen.getByText(MISSING_PAGE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/",
    );
  });
  it("keeps the page wording free of consultations", () => {
    expect(MISSING_PAGE).not.toMatch(/consultation/i);
    expect(MISSING_CONSULTATION).toMatch(/consultation/);
  });
  // Plain language (CONTRIBUTING): no status codes or error jargon on screen.
  // The HTTP status stays 404; only the words change.
  it.each([MISSING_PAGE, MISSING_CONSULTATION])(
    "shows no technical terms (%s)",
    (message) => {
      const { container } = render(<NotFoundState message={message} />);
      expect(container.textContent).not.toMatch(/404|error/i);
    },
  );
});
