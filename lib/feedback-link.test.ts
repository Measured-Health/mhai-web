import { describe, expect, it } from "vitest";
import { feedbackUrl } from "./feedback-link";

const parse = (page: string, vp = "390×844") => new URL(feedbackUrl(page, vp));

describe("feedbackUrl", () => {
  it("opens the design-feedback issue form with page and viewport only", () => {
    const u = parse("/c/mock-1-abc");
    expect(u.origin + u.pathname).toBe(
      "https://github.com/Measured-Health/mhai-web/issues/new",
    );
    expect(u.searchParams.get("template")).toBe("design-feedback.yml");
    expect(u.searchParams.get("page")).toBe("/c/[id]");
    expect(u.searchParams.get("viewport")).toBe("390×844");
    expect(u.searchParams.get("labels")).toBe("design-feedback");
    expect([...u.searchParams.keys()].sort()).toEqual([
      "labels",
      "page",
      "template",
      "viewport",
    ]);
  });

  it("masks consultation and print ids", () => {
    expect(parse("/c/abc123").searchParams.get("page")).toBe("/c/[id]");
    expect(parse("/print/abc123").searchParams.get("page")).toBe("/print/[id]");
    expect(parse("/c/abc123/more").searchParams.get("page")).toBe(
      "/c/[id]/more",
    );
    expect(parse("/").searchParams.get("page")).toBe("/");
  });

  it("drops query strings and fragments (query ids, form or result text)", () => {
    const u = parse("/c/abc123?q=metformin%20dose&id=zz#Jane-Doe");
    expect(u.searchParams.get("page")).toBe("/c/[id]");
    expect(u.toString()).not.toMatch(/metformin|zz|Jane|abc123/);
  });

  it("carries no form text, result text, name or hospital", () => {
    const u = parse(
      "/?question=potassium+in+Jane+Doe&hospital=St+Mary&name=Dr+Ade",
      "1440×900",
    );
    const s = decodeURIComponent(u.toString());
    expect(s).not.toMatch(/potassium|Jane|Doe|Mary|Ade|hospital|question/);
  });

  it("accepts only a plain width×height viewport", () => {
    expect(parse("/", "1440×900").searchParams.get("viewport")).toBe(
      "1440×900",
    );
    expect(parse("/", "Jane Doe").searchParams.get("viewport")).toBe("");
  });
});
