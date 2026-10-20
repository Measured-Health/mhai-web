import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const message =
  "Apps never import from each other. Move shared code into packages/.";

const boundary = (files, group) => ({
  files,
  rules: {
    "no-restricted-imports": ["error", { patterns: [{ group, message }] }],
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
  boundary(
    ["apps/clinical/**"],
    [
      "**/apps/platform/**",
      "**/platform",
      "**/platform/**",
      "**/apps/platform",
      "@mhai/platform",
      "@mhai/platform/*",
    ],
  ),
  boundary(
    ["apps/platform/**"],
    [
      "**/apps/clinical/**",
      "**/clinical",
      "**/clinical/**",
      "**/apps/clinical",
      "@mhai/clinical",
      "@mhai/clinical/*",
    ],
  ),
  boundary(
    ["packages/**"],
    [
      "@mhai/clinical",
      "@mhai/clinical/*",
      "@mhai/platform",
      "@mhai/platform/*",
      "**/apps/**",
    ],
  ),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
  ]),
]);

export default eslintConfig;
