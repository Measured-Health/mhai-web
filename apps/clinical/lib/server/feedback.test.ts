import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appendFeedback, createRateLimit } from "./feedback";

const input = {
  message: "Hi @team, see [this](https://evil.example) ``` and `code`",
  contact: "Ward nurse",
  page: "/c/abc123?q=secret",
  viewport: "390×844",
  website: "",
};

describe("createRateLimit", () => {
  it("allows the limit per window, then refuses until it passes", () => {
    const allow = createRateLimit(2, 1000);
    expect(allow("a", 0)).toBe(true);
    expect(allow("a", 10)).toBe(true);
    expect(allow("a", 20)).toBe(false);
    expect(allow("b", 20)).toBe(true);
    expect(allow("a", 1011)).toBe(true);
  });
});

describe("appendFeedback", () => {
  it("appends one JSON line per message, with the masked page", async () => {
    const dir = await mkdtemp(join(tmpdir(), "fb-"));
    const path = join(dir, "sub", "feedback.jsonl");
    try {
      await appendFeedback(input, path, new Date("2026-10-15T08:00:00Z"));
      await appendFeedback({ ...input, message: "Second one here." }, path);
      const lines = (await readFile(path, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(2);
      const first = JSON.parse(lines[0]!);
      expect(first).toEqual({
        at: "2026-10-15T08:00:00.000Z",
        page: "/c/[id]",
        viewport: "390×844",
        message: input.message,
        contact: "Ward nurse",
      });
      expect(lines[0]).not.toMatch(/abc123|secret/);
      expect((await stat(path)).mode & 0o777).toBe(0o640);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
