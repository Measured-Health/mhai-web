import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// next/font/google fetches font CSS at build time, which broke builds. Fonts
// are self-hosted in packages/tokens/fonts instead.
const root = fileURLToPath(new URL("..", import.meta.url));
const skip = new Set(["node_modules", ".next", "test-results", "coverage"]);

function* sources(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* sources(p);
    else if (/\.(tsx?|jsx?|mjs|cjs|css)$/.test(e.name)) yield p;
  }
}

test("nothing in apps or packages uses next/font/google", () => {
  const hits = [];
  for (const top of ["apps", "packages"]) {
    for (const f of sources(join(root, top))) {
      if (/next\/font\/google/.test(readFileSync(f, "utf8"))) hits.push(f);
    }
  }
  assert.deepEqual(hits, []);
});
