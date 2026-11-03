import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const message =
  "Apps never import from each other. Move shared code into packages/.";

const toClinical = [
  "**/apps/clinical/**",
  "**/clinical",
  "**/clinical/**",
  "**/apps/clinical",
  "@mhai/clinical",
  "@mhai/clinical/*",
];
const toPlatform = [
  "**/apps/platform/**",
  "**/platform",
  "**/platform/**",
  "**/apps/platform",
  "@mhai/platform",
  "@mhai/platform/*",
];
const toApps = [
  "@mhai/clinical",
  "@mhai/clinical/*",
  "@mhai/platform",
  "@mhai/platform/*",
  "**/apps/**",
];

// The BFF's NATS client is server only (docs/adr/0005): only the
// transport's own folder imports nats.js, and client code never imports the
// transport. check:no-nats checks the built chunks too.
const natsClient = {
  group: ["@nats-io/*", "@nats-io/**"],
  message:
    "The NATS client is server only: use @mhai/api-client/server/backend-fetch from lib/server.",
};
const serverModules = {
  group: ["@mhai/api-client/server/*", "@mhai/api-client/server/**"],
  message:
    "Server only: the backend transport and server helpers never reach client code.",
};

const restrict = (files, group, ...extra) => ({
  files,
  rules: {
    "no-restricted-imports": [
      "error",
      { patterns: [...(group ? [{ group, message }] : []), ...extra] },
    ],
  },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Formatting is Prettier's job; turn off conflicting lint rules.
  prettier,
  // The Next plugin looks for the apps under apps/.
  { settings: { next: { rootDir: "apps/*/" } } },
  // Apps never import from each other; packages never import from apps.
  // Later entries replace earlier ones for the same files, so each repeats
  // the whole list.
  restrict(["apps/clinical/**"], toPlatform, natsClient),
  restrict(["apps/platform/**"], toClinical, natsClient),
  restrict(
    ["apps/clinical/components/**"],
    toPlatform,
    natsClient,
    serverModules,
  ),
  restrict(
    ["apps/platform/components/**"],
    toClinical,
    natsClient,
    serverModules,
  ),
  restrict(["packages/**"], toApps, natsClient),
  restrict(["packages/ui/**"], toApps, natsClient, serverModules),
  restrict(
    [
      "packages/api-client/src/server/nats/**",
      "packages/api-client/src/server/*.test.ts",
    ],
    toApps,
  ),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Playwright output: HTML reports with traces carry bundled JS.
    "**/playwright-report/**",
    "**/test-results/**",
  ]),
]);

export default eslintConfig;
