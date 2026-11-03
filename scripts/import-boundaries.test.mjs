import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const cwd = fileURLToPath(new URL("..", import.meta.url));
const eslint = new ESLint({ cwd });

async function restricted(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-imports");
}

function assertBlocked(messages) {
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /Apps never import from each other/);
}

test("clinical can't import the platform app by package name", async () => {
  assertBlocked(
    await restricted(
      'import x from "@mhai/platform/lib/a";\nexport { x };\n',
      "apps/clinical/lib/z.ts",
    ),
  );
});

test("clinical can't reach the platform app by a relative path", async () => {
  assertBlocked(
    await restricted(
      'import x from "../../platform/lib/a";\nexport { x };\n',
      "apps/clinical/lib/z.ts",
    ),
  );
});

test("platform can't import the clinical app", async () => {
  assertBlocked(
    await restricted(
      'import x from "@mhai/clinical";\nexport { x };\n',
      "apps/platform/app/page.tsx",
    ),
  );
});

test("packages can't import an app", async () => {
  assertBlocked(
    await restricted(
      'import x from "../../apps/clinical/lib/a";\nexport { x };\n',
      "packages/tokens/x.ts",
    ),
  );
});

test("an app can import a package and its own code", async () => {
  const messages = await restricted(
    'import "@mhai/tokens/theme.css";\nimport { y } from "@/lib/time";\nexport { y };\n',
    "apps/clinical/lib/z.ts",
  );
  assert.equal(messages.length, 0);
});

test("clinical can't import the platform app by its bare folder", async () => {
  assertBlocked(
    await restricted(
      'import x from "../../platform";\nexport { x };\n',
      "apps/clinical/lib/z.ts",
    ),
  );
});

test("platform can't import the clinical app by its bare folder", async () => {
  assertBlocked(
    await restricted(
      'import x from "../../clinical/lib/a";\nexport { x };\n',
      "apps/platform/app/page.tsx",
    ),
  );
});

function assertNats(messages) {
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, /server only/i);
}

for (const file of [
  "apps/clinical/components/x.tsx",
  "apps/clinical/lib/x.ts",
  "apps/platform/lib/queries/x.ts",
  "apps/platform/components/x.tsx",
  "packages/ui/src/x.ts",
  "packages/api-client/src/request.ts",
]) {
  test(`A1: ${file} can't import the NATS client`, async () => {
    assertNats(
      await restricted(
        'import { connect } from "@nats-io/transport-node";\nexport { connect };\n',
        file,
      ),
    );
    assertNats(
      await restricted(
        'import { headers } from "@nats-io/nats-core";\nexport { headers };\n',
        file,
      ),
    );
  });
}

test("the transport's own folder can import the NATS client", async () => {
  const messages = await restricted(
    'import { connect } from "@nats-io/transport-node";\nexport { connect };\n',
    "packages/api-client/src/server/nats/x.ts",
  );
  assert.equal(messages.length, 0);
});

for (const file of [
  "apps/clinical/components/x.tsx",
  "apps/platform/components/x.tsx",
  "packages/ui/src/x.ts",
]) {
  test(`A1: ${file} can't import the backend transport`, async () => {
    for (const mod of [
      "@mhai/api-client/server/backend-fetch",
      "@mhai/api-client/server/nats/connection",
    ])
      assertNats(
        await restricted(`import * as m from "${mod}";\nexport { m };\n`, file),
      );
  });
}

test("the apps' server code can import the backend transport", async () => {
  for (const file of [
    "apps/clinical/lib/server/backend.ts",
    "apps/platform/lib/server/backend.ts",
  ]) {
    const messages = await restricted(
      'import { createBackendFetch } from "@mhai/api-client/server/backend-fetch";\nexport { createBackendFetch };\n',
      file,
    );
    assert.equal(messages.length, 0);
  }
});

test("the app rule still holds where the NATS rule applies too", async () => {
  assertBlocked(
    await restricted(
      'import x from "@mhai/platform/lib/a";\nexport { x };\n',
      "apps/clinical/components/z.tsx",
    ),
  );
});
