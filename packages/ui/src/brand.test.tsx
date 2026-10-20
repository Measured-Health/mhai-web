import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BhaiLogo, Logo, Mark, PartnerLine } from "./brand";

describe("brand", () => {
  it("renders the logo with an accessible name", () => {
    render(<Logo />);
    expect(
      screen.getByRole("img", { name: "Measured Health" }),
    ).toBeInTheDocument();
  });
  it("renders the M mark with an accessible name", () => {
    render(<Mark />);
    expect(
      screen.getByRole("img", { name: "Measured Health" }),
    ).toBeInTheDocument();
  });
  it("credits the BHAI partnership with its logo and name only", () => {
    const { container } = render(<PartnerLine />);
    expect(screen.getByText(/In partnership with/)).toBeInTheDocument();
    expect(screen.getByText("BHAI")).toBeInTheDocument();
    expect(
      container.querySelector('img[src="/brand/bhai-logo.png"]'),
    ).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/University of Chicago/);
  });
  it("keeps the BHAI logo decorative next to the written name", () => {
    const { container } = render(<BhaiLogo />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden");
  });
});
