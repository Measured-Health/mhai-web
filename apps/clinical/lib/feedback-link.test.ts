import { describe, expect, it } from "vitest";
import { FeedbackSchema, cleanViewport, maskPage } from "./feedback-link";

describe("maskPage", () => {
  it("masks consultation and print ids", () => {
    expect(maskPage("/c/abc123")).toBe("/c/[id]");
    expect(maskPage("/print/abc123")).toBe("/print/[id]");
    expect(maskPage("/c/abc123/more")).toBe("/c/[id]/more");
    expect(maskPage("/")).toBe("/");
    expect(maskPage("")).toBe("/");
  });

  it("drops query strings and fragments (ids, form or result text)", () => {
    expect(maskPage("/c/abc123?q=metformin%20dose&id=zz#Jane-Doe")).toBe(
      "/c/[id]",
    );
  });
});

describe("cleanViewport", () => {
  it("keeps a plain screen size and drops anything else", () => {
    expect(cleanViewport("390×844")).toBe("390×844");
    expect(cleanViewport("390x844")).toBe("");
    expect(cleanViewport("<script>")).toBe("");
  });
});

describe("FeedbackSchema", () => {
  const ok = {
    message: "The banner is easy to miss on mobile.",
    contact: "",
    page: "/",
    viewport: "390×844",
    website: "",
  };
  it("accepts a normal message", () => {
    expect(FeedbackSchema.safeParse(ok).success).toBe(true);
  });
  it("needs 10 to 2000 characters, after trimming", () => {
    expect(
      FeedbackSchema.safeParse({ ...ok, message: "   short   " }).success,
    ).toBe(false);
    expect(
      FeedbackSchema.safeParse({ ...ok, message: "x".repeat(2001) }).success,
    ).toBe(false);
  });
  it("rejects a filled spam trap", () => {
    expect(
      FeedbackSchema.safeParse({ ...ok, website: "spam.example" }).success,
    ).toBe(false);
  });
});
