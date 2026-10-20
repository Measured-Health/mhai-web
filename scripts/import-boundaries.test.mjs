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
