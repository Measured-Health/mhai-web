import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readme = readFileSync("README.md", "utf8");

describe("README demo instructions", () => {
  it("sets NEXT_PUBLIC_USE_MOCK for the build (inlined at build time), not just start", () => {
    expect(readme).toContain(
      "NEXT_PUBLIC_USE_MOCK=true npm run build && npx next start",
    );
    expect(readme).not.toMatch(/npm run build && NEXT_PUBLIC_USE_MOCK=true/);
  });

  it("documents the whole-word triggers, with no bare 'review' trigger", () => {
    expect(readme).toMatch(/"potassium" gives Needs\s+review/);
    expect(readme).toMatch(/Words match whole/);
  });
});
