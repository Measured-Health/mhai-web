import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DemoRibbon } from "./demo-ribbon";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("DemoRibbon", () => {
  it("labels the build as sample data and links to feedback", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    render(<DemoRibbon />);
    expect(
      screen.getByText(/sample data, not for clinical use/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Give feedback/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("renders a static href (no pathname or viewport at render time)", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    render(<DemoRibbon />);
    const href = screen
      .getByRole("link", { name: /Give feedback/ })
      .getAttribute("href")!;
    expect(href).toContain("template=design-feedback.yml");
    expect(href).not.toMatch(/viewport=\d/);
  });

  it("builds the link in the click handler from masked path and viewport", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    window.history.pushState({}, "", "/c/abc123?q=secret");
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<DemoRibbon />);
    fireEvent.click(screen.getByRole("link", { name: /Give feedback/ }));
    expect(open).toHaveBeenCalledTimes(1);
    const [url, target, features] = open.mock.calls[0]!;
    const u = new URL(String(url));
    expect(u.searchParams.get("page")).toBe("/c/[id]");
    expect(u.searchParams.get("viewport")).toBe(
      `${window.innerWidth}×${window.innerHeight}`,
    );
    expect(String(url)).not.toMatch(/abc123|secret/);
    expect(target).toBe("_blank");
    expect(features).toBe("noopener");
    window.history.pushState({}, "", "/");
  });

  it("is absent outside mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const { container } = render(<DemoRibbon />);
    expect(container).toBeEmptyDOMElement();
  });
});
