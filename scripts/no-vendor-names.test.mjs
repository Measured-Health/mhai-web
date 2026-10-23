import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { VENDOR_NAMES, findVendor } from "./vendor-names.mjs";

export { VENDOR_NAMES };

// No product or vendor names in the apps' code, tests and fixtures, or in the
// packages' sources (spec §3, Plan 13). Connector types are named by standard
// or method only.
const root = fileURLToPath(new URL("..", import.meta.url));
const self = fileURLToPath(import.meta.url);
const skip = new Set(["node_modules", ".next", "test-results", "coverage"]);

const dirs = (parent, inner) =>
  readdirSync(join(root, parent), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => inner.map((i) => join(root, parent, e.name, i)))
    .filter((d) => {
      try {
        return statSync(d).isDirectory();
      } catch {
        return false;
      }
    });

function* files(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* files(p);
    else if (p !== self && /\.(tsx?|jsx?|mjs|cjs|json|css|md)$/.test(e.name))
      yield p;
  }
}

test("no vendor or product name appears in apps or packages", () => {
  const hits = [];
  const places = [
    ...dirs("apps", ["app", "components", "lib", "tests"]),
    ...dirs("packages", ["src"]),
  ];
  assert.ok(places.length > 0, "found nothing to check");
  for (const d of places)
    for (const f of files(d)) {
      const m = findVendor(readFileSync(f, "utf8"));
      if (m) hits.push(`${relative(root, f)}: ${m}`);
    }
  assert.deepEqual(hits, []);
});

test("the list itself is lower case, whole words", () => {
  for (const v of VENDOR_NAMES) assert.match(v, /^[a-z]+$/);
});

// The test strings are built from parts so this file doesn't trip the guard.
test("the guard catches names inside identifiers, and not ordinary words", () => {
  const j = (...p) => p.join("");
  for (const hit of [
    j("ep", "ic", "_fhir"),
    j("Ep", "icClient"),
    j("cerner", "Millennium"),
    j("DHI", "S2"),
    j("athena", "health"),
    j("Cer", "ner"),
    j("open", "mrs-sync"),
  ])
    assert.ok(findVendor(hit), hit);
  for (const ok of ["epicenter", "label", "collaborate", "oracles", "athens"])
    assert.equal(findVendor(ok), null, ok);
});
