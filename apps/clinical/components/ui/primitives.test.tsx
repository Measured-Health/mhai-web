import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfidencePill } from "./confidence-pill";
import { LinkTabs } from "./link-tabs";

describe("ConfidencePill", () => {
  it("states the level in words and bars, not colour alone", () => {
    render(<ConfidencePill label="High confidence" bars={4} />);
    const pill = screen.getByRole("status", {
      name: "High confidence, 4 of 5 bars",
    });
    expect(pill).toHaveTextContent("High");
    expect(pill.querySelectorAll("[data-bar=on]")).toHaveLength(4);
  });
});

describe("LinkTabs", () => {
  it("marks the current tab as the page", () => {
    render(
      <LinkTabs
        label="Notifications"
        current="alerts"
        tabs={[
          { id: "alerts", href: "/notifications", label: "Patient alerts" },
          {
            id: "corrections",
            href: "/notifications/corrections",
            label: "Corrections",
          },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Notifications" });
    expect(nav).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Patient alerts" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("link", { name: "Corrections" }),
    ).not.toHaveAttribute("aria-current");
  });
});
