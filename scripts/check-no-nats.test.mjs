import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NATS_MARKERS, findNatsCode } from "./check-no-nats.mjs";

const cli = fileURLToPath(new URL("./check-no-nats.mjs", import.meta.url));

async function fixture(files) {
  const dir = await mkdtemp(join(tmpdir(), "no-nats-"));
  for (const [path, content] of Object.entries(files)) {
    const full = join(dir, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, content);
  }
  return dir;
}

test("A1: each marker in a client chunk is found", async () => {
  assert.deepEqual(
    [...NATS_MARKERS].sort(),
    [
      "@nats-io",
      "_INBOX_bff",
      "nkeyAuthenticator",
      "Mhai-Timeout-Ms",
      "NATS_NKEY_SEED_FILE",
    ].sort(),
  );
  for (const marker of NATS_MARKERS) {
    const dir = await fixture({ "static/chunks/app/x.js": `a="${marker}"` });
    try {
      assert.deepEqual(await findNatsCode(dir), ["static/chunks/app/x.js"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("server output is not scanned (only static/)", async () => {
  const dir = await fixture({
    "server/chunks/ssr/x.js": 'require("@nats-io/transport-node")',
    "standalone/node_modules/@nats-io/x.js": "_INBOX_bff",
    "static/chunks/clean.js": "1",
  });
  try {
    assert.deepEqual(await findNatsCode(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a clean build passes", async () => {
  const dir = await fixture({
    "static/chunks/a.js": "1",
    "static/css/b.css": "2",
  });
  try {
    assert.deepEqual(await findNatsCode(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the CLI fails on a planted marker and passes a clean build", async () => {
  const bad = await fixture({ "static/chunks/a.js": "nkeyAuthenticator()" });
  const good = await fixture({ "static/chunks/a.js": "1" });
  try {
    const r1 = spawnSync(process.execPath, [cli, good, bad], {
      encoding: "utf8",
    });
    assert.equal(r1.status, 1);
    assert.match(r1.stdout, /static\/chunks\/a\.js/);
    const r2 = spawnSync(process.execPath, [cli, good], { encoding: "utf8" });
    assert.equal(r2.status, 0);
  } finally {
    await rm(bad, { recursive: true, force: true });
    await rm(good, { recursive: true, force: true });
  }
});

test("the CLI fails on a missing build", () => {
  const r = spawnSync(
    process.execPath,
    [cli, join(tmpdir(), "no-such-build")],
    {
      encoding: "utf8",
    },
  );
  assert.equal(r.status, 2);
});
