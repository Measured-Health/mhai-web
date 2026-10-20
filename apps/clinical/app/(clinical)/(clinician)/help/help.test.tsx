import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FORBIDDEN_TERMS } from "@/lib/labels";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/help",
}));

import Help from "./page";

describe("Help", () => {
  it("doesn't claim every claim links to a guideline (unmatched claims exist)", () => {
    const { container } = render(<Help />);
    expect(container.textContent).not.toMatch(/Every claim links/i);
  });

  it("explains Evidence match, the label the measures bar uses", () => {
    render(<Help />);
    expect(screen.getByText("Evidence match")).toBeInTheDocument();
  });

  it("uses no forbidden words", () => {
    const t = render(<Help />).container.textContent ?? "";
    for (const term of FORBIDDEN_TERMS)
      expect(t).not.toMatch(new RegExp(`\\b${term}\\b`, "i"));
  });
});
