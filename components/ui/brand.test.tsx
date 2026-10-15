import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, Mark, PartnerLine } from "./brand";

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
  it("credits the BHAI partnership", () => {
    render(<PartnerLine />);
    expect(screen.getByText(/In partnership with/)).toBeInTheDocument();
    expect(screen.getByText("BHAI")).toBeInTheDocument();
    expect(screen.getByText(/University of Chicago/)).toBeInTheDocument();
  });
});
