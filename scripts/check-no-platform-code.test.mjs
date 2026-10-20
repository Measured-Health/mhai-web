import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findPlatformCode } from "./check-no-platform-code.mjs";
import { PLATFORM_MARKER } from "./platform-marker.mjs";

const cli = fileURLToPath(
  new URL("./check-no-platform-code.mjs", import.meta.url),
);

async function fixture(files) {
  const dir = await mkdtemp(join(tmpdir(), "no-platform-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

test("finds the marker in a nested chunk", async () => {
  const dir = await fixture({
    "static/chunks/a.js": `x="${PLATFORM_MARKER}"`,
    "server/app/page.js": "console.log('clinical')",
  });
  try {
    assert.deepEqual(await findPlatformCode(dir), ["static/chunks/a.js"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clean build passes", async () => {
  const dir = await fixture({ "a.js": "1", "b/c.js": "2" });
  try {
    assert.deepEqual(await findPlatformCode(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips the build cache", async () => {
  const dir = await fixture({ "cache/x.pack": PLATFORM_MARKER });
  try {
    assert.deepEqual(await findPlatformCode(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the CLI fails on a missing build", () => {
  const r = spawnSync(
    process.execPath,
    [cli, join(tmpdir(), "no-such-build-dir")],
    {
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /No build at/);
});

test("the CLI fails when it finds platform code", async () => {
  const dir = await fixture({ "static/a.js": PLATFORM_MARKER });
  try {
    const r = spawnSync(process.execPath, [cli, dir], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /static\/a\.js/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
