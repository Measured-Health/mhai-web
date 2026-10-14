import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/c/q1" }));

const items = [
  {
    id: "q1",
    title: "Chest pain, 54 M",
    urgency: "urgent" as const,
    createdAt: Date.now(),
    kind: "high" as const,
    query: {} as never,
  },
  {
    id: "q2",
    title: "Febrile child, 3 F",
    urgency: "routine" as const,
    createdAt: Date.now(),
    kind: "caution" as const,
    flagged: true,
    query: {} as never,
  },
];

describe("Sidebar", () => {
  it("lists session history with plain-language status and marks the current one", () => {
    render(<Sidebar items={items} />);
    expect(
      screen.getByRole("link", { name: /Chest pain, 54 M/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
    expect(screen.getByLabelText("Flagged")).toBeInTheDocument();
  });
  it("shows the new consultation action, session note and hospital", () => {
    render(<Sidebar items={[]} />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByText(/kept for this session only/)).toBeInTheDocument();
    expect(screen.getByText("Havana Hospital")).toBeInTheDocument();
  });
  it("links to Help from the footer", () => {
    render(<Sidebar items={[]} />);
    expect(screen.getByRole("link", { name: /Help/ })).toHaveAttribute(
      "href",
      "/help",
    );
  });
  it("keeps labels accessible in rail mode", () => {
    render(<Sidebar items={items} rail />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toBeVisible();
    expect(screen.getByText("New consultation")).toHaveClass("sr-only");
  });
});
