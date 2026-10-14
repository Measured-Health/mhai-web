import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

const sources = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const SRC = [...sources("components"), ...sources("app")];

/**
 * Looping animations that are exempt from the "durations are tokens" rule.
 * Each entry is `file::literal` and cites the spec line that exempts it.
 */
const ALLOWED_LITERALS: { file: string; hit: string }[] = [
  // ECG line is a continuous loop, not a transition (spec S:115).
  { file: "components/processing/ecg-line.tsx", hit: "animate-[ecg_2.2s" },
  // Live-dot pulse is a continuous loop (spec S:127).
  {
    file: "components/processing/stage-list.tsx",
    hit: "animate-[pulse-dot_1.2s",
  },
];

const PATTERNS: RegExp[] = [
  /animate-\[[^\]]*?_\d+(?:\.\d+)?m?s/g,
  /duration-\d/g,
  /(?:animation|transition)(?:-delay)?\s*:[^;{}]*?\d+(?:\.\d+)?m?s\b/g,
];

describe("motion", () => {
  it("defines the motion classes in globals.css", () => {
    for (const c of [".reveal", ".shake-once", ".draw-once"])
      expect(css, c).toContain(c);
    for (const k of ["shake", "draw"])
      expect(css, `@keyframes ${k}`).toMatch(new RegExp(`@keyframes ${k}\\b`));
  });

  it("defines every keyframe used in components", () => {
    const used = new Set(
      SRC.flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/animate-\[([a-zA-Z-]+)_/g)].map(
          (m) => m[1],
        ),
      ),
    );
    for (const name of used)
      expect(css, `@keyframes ${name}`).toMatch(
        new RegExp(`@keyframes ${name}\\b`),
      );
  });

  it("turns motion off for reduced-motion users", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 1ms !important/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*\.reveal\s*>\s*\*[\s\S]*animation: none/,
    );
  });

  it("only fades whole blocks in .reveal, never text inside them", () => {
    expect(css).not.toMatch(/\.reveal\s+[a-z*.]/);
    expect(css).not.toMatch(/\.reveal\s*>\s*\*\s*[>\s]\s*[a-z*.]/);
  });

  it("keeps draw-once within the story duration", () => {
    const rule = css.match(/\.draw-once[^{]*\{[^}]*\}/g)?.join("") ?? "";
    expect(rule).toMatch(/animation:\s*draw var\(--t-story\)/);
  });

  it("never animates the safety banner", () => {
    expect(readFileSync("components/ui/banner.tsx", "utf8")).not.toMatch(
      /animate-|transition/,
    );
  });

  it("uses only the motion tokens for animation and transition durations", () => {
    const offenders: string[] = [];
    for (const f of SRC) {
      const text = readFileSync(f, "utf8");
      for (const re of PATTERNS)
        for (const m of text.matchAll(re)) {
          const hit = m[0];
          const allowed = ALLOWED_LITERALS.some(
            (a) => a.file === f.replaceAll("\\", "/") && hit.startsWith(a.hit),
          );
          if (!allowed) offenders.push(`${f}: ${hit}`);
        }
    }
    expect(offenders).toEqual([]);
  });
});
