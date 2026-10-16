import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/c/q1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const items = [
  {
    id: "q1",
    title: "Chest pain, 54 M",
    urgency: "urgent" as const,
    createdAt: Date.now(),
    kind: "high" as const,
    confidenceLabel: "High confidence",
    query: {} as never,
  },
  {
    id: "q2",
    title: "Febrile child, 3 F",
    urgency: "routine" as const,
    createdAt: Date.now(),
    kind: "caution" as const,
    confidenceLabel: "Use with caution",
    flagged: true,
    query: {} as never,
  },
];

describe("Sidebar", () => {
  it("labels questions saved offline as waiting, or as couldn't send", () => {
    renderWithAuth(
      <Sidebar
        items={[
          { ...items[0], id: "local-1", kind: undefined, pending: "waiting" },
          { ...items[1], id: "local-2", kind: undefined, pending: "failed" },
        ]}
      />,
    );
    expect(screen.getByText(/Waiting to send ·/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't send ·/)).toBeInTheDocument();
  });

  it("lists session history with plain-language status and marks the current one", () => {
    renderWithAuth(<Sidebar items={items} />);
    expect(
      screen.getByRole("link", { name: /Chest pain, 54 M/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
    expect(screen.getByLabelText("Flagged")).toBeInTheDocument();
  });
  it("says 'Completed', not a confidence level, when the result screen showed none", () => {
    renderWithAuth(
      <Sidebar
        items={[
          { ...items[0], confidenceLabel: null },
          { ...items[1], confidenceLabel: null },
        ]}
      />,
    );
    expect(screen.queryByText(/High confidence/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Use with caution/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Completed/)).toHaveLength(2);
  });
  it("keeps the review and failed labels, which are not confidence levels", () => {
    renderWithAuth(
      <Sidebar
        items={[
          { ...items[0], kind: "review", confidenceLabel: null },
          { ...items[1], kind: "failed", confidenceLabel: null },
        ]}
      />,
    );
    expect(screen.getByText(/Needs review/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn't complete/)).toBeInTheDocument();
  });
  it("shows the new consultation action, session note and hospital", () => {
    renderWithAuth(<Sidebar items={[]} />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByText(/kept for this session only/)).toBeInTheDocument();
    expect(screen.getByText("Havana Hospital")).toBeInTheDocument();
  });
  it("links to Help from the footer", () => {
    renderWithAuth(<Sidebar items={[]} />);
    expect(screen.getByRole("link", { name: /Help/ })).toHaveAttribute(
      "href",
      "/help",
    );
  });
  it("keeps labels accessible in rail mode", () => {
    renderWithAuth(<Sidebar items={items} rail />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toBeVisible();
    expect(screen.getByText("New consultation")).toHaveClass("sr-only");
  });
  it("hides the account footer when nobody is signed in", () => {
    renderWithAuth(<Sidebar items={[]} />, null);
    expect(screen.queryByText("Havana Hospital")).not.toBeInTheDocument();
  });
});
