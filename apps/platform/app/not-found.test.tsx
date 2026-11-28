import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("platform NotFound", () => {
  it("says the page can't be found in plain words and links to hospitals", () => {
    const { container } = render(<NotFound />);
    expect(
      screen.getByRole("heading", { name: "We can't find that page" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to hospitals" }),
    ).toHaveAttribute("href", "/hospitals");
    // Plain language (CONTRIBUTING): no status codes or error jargon.
    expect(container.textContent).not.toMatch(/404|error/i);
  });
});
