# Plan 7a: The npm workspaces move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repository into npm workspaces, with today's app moved
unchanged to `apps/clinical` and the design tokens in `packages/tokens`. Add
the two guards the platform admin app relies on: a lint rule that blocks
imports between apps, and a build check that the clinical bundle carries no
platform code. CI, the Docker image and the docs follow the new paths. **No
behaviour changes.**

**Architecture:**

- **Root:** `package.json` becomes the workspace root (`"workspaces":
["apps/*", "packages/*"]`). It keeps the shared tooling (ESLint, Prettier,
  TypeScript) and the same script names as today, which delegate to the
  workspaces. `npm run dev`, `lint`, `typecheck`, `format`, `test`, `build`
  and `e2e` keep working from the root, so CI and the docs' commands barely
  change.
- **`apps/clinical`** (package `@mhai/clinical`) is moved with `git mv` as
  is. It contains `app/`, `components/`, `lib/`, `tests/`, `public/`, `proxy.ts`
  and its own Next, TypeScript, Vitest and Playwright configs. The `@/*` alias
  still points at the app's own folder, so no import changes.
- **`packages/tokens`** (package `@mhai/tokens`) holds the design v3 `@theme`
  block as CSS. The clinical `globals.css` imports it. The built CSS must
  come out byte for byte the same as before the move.
- **Guards:**
  - an ESLint `no-restricted-imports` rule per app;
  - `scripts/check-no-platform-code.mjs`, which scans a build folder for the
    platform app's marker string;
  - both tested with `node --test` in `scripts/`.
- `packages/ui` and `packages/api-client` are **not** created here (see
  Rulings).

**Tech Stack:** npm workspaces (npm 11, Node 24), Next.js 16.4
(`cacheComponents`, Turbopack, `output: "standalone"`), Tailwind 4 via
`@tailwindcss/turbopack`, ESLint 9 flat config, Vitest 5, Playwright 1.64,
`node:test`, Docker (arm64 image, GHCR).

**Spec:** `docs/specs/2026-10-17-platform-admin-design.md` §3 (repository),
§12 (testing: Plan 7a) and §14 (delivery). Background: ADR 0002, ADR 0004 and
`ARCHITECTURE.md` §3.

## Global Constraints

- **Plan 7a changes no behaviour.** The proof:
  - the existing unit and end-to-end suites pass with their assertions
    unchanged;
  - the same number of tests run (unit 1457; e2e 119 passed, 1 skipped);
  - the same routes build;
  - the built CSS is identical.
- Only file paths inside tests may change, plus the README's pinned demo
  command (Task 6).
- **Neither app imports from the other.** A lint rule enforces it, and shared
  code goes into `packages/` only when both apps need it (spec §3).
- **Workspace names:**
  - `@mhai/clinical` (`apps/clinical`);
  - `@mhai/platform` (`apps/platform`, created in Plan 7b);
  - `@mhai/tokens` (`packages/tokens`).

  All are `"private": true`.

- **Dependency versions don't change.** Every resolved `name@version` in
  `package-lock.json` stays the same, apart from the new workspace link
  entries. Exact pins stay exact. `engines.node` stays `">=24 <25"`.
- **The platform marker string** is `mhai-platform-app`, in
  `scripts/platform-marker.mjs` (`export const PLATFORM_MARKER =
"mhai-platform-app"`). Plan 7b puts it in the platform app's root layout.
- **Deploy:**
  - the image name (`ghcr.io/measured-health/mhai-web`) and the compose
    service stay the same;
  - the container still listens on 8080 and runs as uid 1001;
  - the deploy workflow's health check (home 200, `/c/x` 404) is unchanged.
- **No other changes:**
  - no behaviour change in the app, no new runtime dependency, no change to
    `design/` or `docs/specs/`;
  - no Cloudflare or Wrangler config: none is committed today (the
    `.open-next`/`.wrangler` ignores are leftovers), and the platform's
    deploy config is Plan 7b.
- **Repo rules:**
  - plain words in docs;
  - no vendor names (ADR 0003);
  - no AI attribution in commits;
  - never `git add -f` anything under `.superpowers/`.

## Rulings made while planning

- **Spec §3 lists `packages/ui` and `packages/api-client`; Plan 7a doesn't
  create them.** The spec's own rule says shared code moves only when both
  apps need it, and that need first exists in Plan 7b (the account screens,
  network and idempotency helpers). Empty packages would prove nothing. If
  this is wrong, Plan 7b creates them anyway, so nothing is lost.
- **`packages/tokens` does move here.** Both apps need the tokens for
  certain (spec §6). Importing CSS from a workspace package through Tailwind
  and Turbopack is the riskiest wiring in the move, so it is proved now,
  with the identical-CSS check, while nothing else changes.
- **The bundle check** can only find something once the platform app exists.
  Here it is proved against fixtures that do and don't contain the marker,
  and it runs in CI after the clinical build from day one.
- **The Dockerfile moves to `apps/clinical/Dockerfile`,** built with the
  repository root as its context, so Plan 7b's platform Dockerfile sits next
  to its own app.

## Review Focus

1. **A local `.env.local` at the repository root is silently ignored after
   the move.** Next reads env files from `apps/clinical`. A developer's live
   API settings would vanish, and the app would fall back to mock or break.
   The README and CHANGELOG must say to move `.env.local` into
   `apps/clinical/` (Task 6 pins this in `tests/readme.test.ts`).
2. **The standalone Docker image misses `public/` or `.next/static`** at the
   nested path. The home page would load unstyled, or the server would fail
   to start. Task 4 builds and runs the image, then checks the home page,
   a 404, and that a CSS file is served.
3. **Tailwind stops seeing class names in moved files, or the `@theme`
   tokens.** Pages would lose styles silently, and unit tests wouldn't notice.
   Tasks 1 and 5 compare the built CSS with a pre-move baseline.
4. **The lint rule misses a relative path that escapes into the other app**
   (`../../platform/...`), or a package importing an app. Task 2's tests
   cover a relative import, a package-name import and a `packages/` file.
5. **Running a command from inside `apps/clinical`** (`npx vitest run`,
   `npx playwright test`, `npm run dev`) instead of the root. Paths in tests
   (`app/globals.css`, `README.md`) must resolve either way. Task 1 runs the
   unit suite both ways.

---

## File structure

```text
mhai-web/
├── package.json             workspace root: tooling + delegating scripts
├── package-lock.json        regenerated, same versions
├── eslint.config.mjs        root flat config + cross-app import rule
├── .prettierrc.json · .prettierignore · .gitignore · .dockerignore · .nvmrc
├── scripts/
│   ├── platform-marker.mjs          PLATFORM_MARKER
│   ├── check-no-platform-code.mjs   build scan (CLI)
│   ├── check-no-platform-code.test.mjs
│   ├── import-boundaries.test.mjs   lint rule tests
│   └── lockfile-versions.mjs        name@version list for the no-drift check
├── apps/clinical/           @mhai/clinical (moved unchanged)
│   ├── package.json · Dockerfile · next.config.ts · tsconfig.json
│   ├── vitest.config.mts · playwright.config.ts · proxy.ts · .env.example
│   └── app/ components/ lib/ tests/ public/
├── packages/tokens/         @mhai/tokens
│   ├── package.json · theme.css · README.md
├── deploy/ design/ docs/    unchanged places
└── README.md AGENTS.md CLAUDE.md CONTRIBUTING.md ARCHITECTURE.md CHANGELOG.md SECURITY.md
```

---

### Task 1: Workspace root and the clinical app at `apps/clinical`

**Files:**

- Move (`git mv`): `app/`, `components/`, `lib/`, `tests/`, `public/`,
  `proxy.ts`, `next.config.ts`, `tsconfig.json`, `vitest.config.mts`,
  `playwright.config.ts`, `.env.example` → `apps/clinical/`
- Create: `apps/clinical/package.json`, `scripts/lockfile-versions.mjs`
- Modify: `package.json`, `package-lock.json`, `eslint.config.mjs`,
  `.gitignore`, `.prettierignore`, `apps/clinical/next.config.ts`,
  `apps/clinical/tests/readme.test.ts` (path only),
  `apps/clinical/lib/motion.test.ts` (paths only, if needed)

**Interfaces:**

- Produces:
  - the root scripts `dev`, `build`, `start`, `lint`, `typecheck`, `format`,
    `format:check`, `test`, `e2e`;
  - the workspace `@mhai/clinical`, with the scripts `dev`, `build`, `start`,
    `typecheck`, `test`, `test:watch` and `e2e` (today's commands);
  - `scripts/lockfile-versions.mjs`: a CLI `node
scripts/lockfile-versions.mjs <package-lock.json>`. It prints the sorted,
    unique `name@version` list of every entry under `packages` that has a
    `version` and is not a workspace link (`link: true`) or a workspace
    folder (keys `apps/*`, `packages/*`, `""`).

- [ ] **Step 1: Record the baseline (before moving anything)**

  On the current tree, run each of these and save the output to the plan
  workspace (`.superpowers/sdd/<plan>/baseline/`, never committed):
  - `npm ci && npm run build`: save the route table that `next build` prints
    (`baseline/routes.txt`), and concatenate `.next/static/css/*.css`,
    sorted by file name, into `baseline/app.css`;
  - `npm test`: save the summary line (expected: `Tests  1457 passed`);
  - `node scripts/lockfile-versions.mjs package-lock.json >
baseline/versions.txt`. Write the script first; it is pure, so no test
    beyond this check.

- [ ] **Step 2: Move the app and split `package.json`**
  - `git mv` the files listed above into `apps/clinical/`. Don't edit their
    contents in this commit, so git records them as renames.
  - `apps/clinical/package.json`: `"name": "@mhai/clinical"`, `"private":
true`, `"version": "0.1.0"`. Today's `dependencies` move here, along with
    the dev dependencies only this app uses: Testing Library,
    `@vitejs/plugin-react`, `vite-tsconfig-paths`, `vitest`, `jsdom`,
    `fake-indexeddb`, `@playwright/test`, `@types/qrcode`,
    `@tailwindcss/turbopack` and `tailwindcss`. Keep today's version strings
    exactly.
  - The scripts are today's: `next dev`, `next build`, `next start`,
    `next typegen && tsc --noEmit`, `vitest run`, `vitest`,
    `playwright test`.
  - The root `package.json` keeps:
    - `"name": "mhai-web"`, `"private": true`, `engines`, and
      `"workspaces": ["apps/*", "packages/*"]`;
    - the dev dependencies `eslint`, `eslint-config-next`,
      `eslint-config-prettier`, `prettier`, `typescript`, `@types/node`,
      `@types/react` and `@types/react-dom`.
  - Root scripts:

    | script         | runs                                                         |
    | -------------- | ------------------------------------------------------------ |
    | `dev`          | `npm run dev -w @mhai/clinical`                              |
    | `build`        | `npm run build -w @mhai/clinical`                            |
    | `start`        | `npm run start -w @mhai/clinical`                            |
    | `lint`         | `eslint`                                                     |
    | `typecheck`    | `npm run typecheck --workspaces --if-present`                |
    | `format`       | `prettier --write .`                                         |
    | `format:check` | `prettier --check .`                                         |
    | `test`         | `npm test --workspaces --if-present && node --test scripts/` |
    | `e2e`          | `npm run e2e -w @mhai/clinical`                              |

    `node --test scripts/` finds no tests yet. If an empty run fails, add the
    `node --test` part in Task 2 instead.

- [ ] **Step 3: Point Next at the repository root**

  In `apps/clinical/next.config.ts`, set `outputFileTracingRoot` and
  `turbopack.root` to the repository root (`path.join(import.meta.dirname,
"../..")`), so standalone tracing and Turbopack see the hoisted
  `node_modules`. Keep every other option. First read the Next 16.4 docs in
  `node_modules/next/dist/docs/` for both options (AGENTS.md: this Next
  differs from older versions).

- [ ] **Step 4: Root config files**
  - **`eslint.config.mjs`:**
    - set `settings: { next: { rootDir: "apps/*/" } }` so the Next plugin
      finds the app;
    - change the ignores to `**/.next/**`, `**/out/**`, `**/build/**` and
      `**/next-env.d.ts`.
  - **`.gitignore`:**
    - un-anchor `/.next/`, `/out/`, `/build`, `/coverage` and
      `/node_modules` (e.g. `node_modules/`), so the nested copies are
      ignored;
    - keep the other entries.
  - **`.prettierignore`:** use `**/.next` and `**/node_modules`; the rest
    as is.

- [ ] **Step 5: Install and check that no versions drifted**

  Run `rm -rf node_modules && npm install` to regenerate the lockfile, then
  `npm ci`. Next:

  ```bash
  node scripts/lockfile-versions.mjs package-lock.json | diff baseline/versions.txt -
  ```

  Expected: no output. If something drifted, pin it back in the right
  `package.json` and repeat.

- [ ] **Step 6: Fix the test paths only**

  `npm test` runs Vitest with `apps/clinical` as its working directory, so
  `app/globals.css` and `components/...` still resolve. `tests/readme.test.ts`
  reads `README.md`, which stays at the root. Make it read the README from
  the repository root via a path built from `import.meta.dirname`
  (`../../../README.md`), so it works from any working directory. Do the
  same for any other path in `lib/motion.test.ts` that the runs below show
  failing. **No assertion changes.**

- [ ] **Step 7: Verify that nothing changed**

  Run all of these, with these expected results:
  - `npm run lint`: 0 problems.
  - `npm run format:check`: clean.
  - `npm run typecheck`: clean.
  - `npm test`: `1457 passed`, the same count as the baseline.
  - `cd apps/clinical && npx vitest run`: `1457 passed`. This is the Review
    Focus 5 check.
  - `npm run build`:
    - the route table equals `baseline/routes.txt`, apart from the timing
      and size columns;
    - the CSS, concatenated as in Step 1, matches `baseline/app.css`
      (`diff` shows no output).
  - `NEXT_PUBLIC_USE_MOCK=true npm run e2e`: 119 passed, 1 skipped.

- [ ] **Step 8: Commit**

  Make two commits, so review can see that the files moved unchanged:
  1. "Move the clinical app to apps/clinical": the `git mv` only.
  2. "Make the repository npm workspaces": everything else.

---

### Task 2: Block imports between apps

**Files:**

- Modify: `eslint.config.mjs`
- Create: `scripts/import-boundaries.test.mjs`

**Interfaces:**

- Consumes: the root `eslint.config.mjs` from Task 1.
- Produces: lint errors for imports that cross an app boundary.
  - In `apps/clinical/**`: anything matching `**/apps/platform/**`,
    `**/platform/**` reached by a relative path, or `@mhai/platform` /
    `@mhai/platform/*`.
  - In `apps/platform/**`: the same, mirrored for `clinical`.
  - In `packages/**`: any import of `@mhai/clinical*`, `@mhai/platform*` or
    `**/apps/**`.
  - The message reads: "Apps never import from each other. Move shared code
    into packages/."

- [ ] **Step 1: Write the failing tests**

  Use `node:test` and ESLint's Node API: `new ESLint({ cwd: <repo root> })`,
  then `lintText(code, { filePath })`. File paths need not exist. Tests in
  `scripts/import-boundaries.test.mjs`:
  - `"clinical can't import the platform app by package name"`: `import x
from "@mhai/platform/lib/a";` at `apps/clinical/lib/z.ts` gives exactly one
    `no-restricted-imports` message, containing "Apps never import from each
    other".
  - `"clinical can't reach the platform app by a relative path"`: `import x
from "../../platform/lib/a";` at `apps/clinical/lib/z.ts` gives the same
    error.
  - `"platform can't import the clinical app"`: `import x from
"@mhai/clinical";` at `apps/platform/app/page.tsx` gives the same error.
  - `"packages can't import an app"`: `import x from
"../../apps/clinical/lib/a";` at `packages/tokens/x.ts` gives the same
    error.
  - `"an app can import a package and its own code"`: `import "@mhai/tokens/theme.css"; import { y } from "@/lib/time";` at
    `apps/clinical/lib/z.ts` gives no `no-restricted-imports` message.

- [ ] **Step 2: Run them to see them fail**

  Run `node --test scripts/import-boundaries.test.mjs`. Expected: the first
  four fail (no message), and the last passes.

- [ ] **Step 3: Add the rule**

  In `eslint.config.mjs`, add three config objects, scoped by `files` to
  `apps/clinical/**`, `apps/platform/**` and `packages/**`. Each uses
  `no-restricted-imports` with `patterns: [{ group: [...], message }]`, built
  from the Interfaces block.

- [ ] **Step 4: Run them to see them pass, then the whole check**

  Run `node --test scripts/`: all pass. Then run `npm run lint`: 0 problems.
  Today's code imports nothing across apps.

- [ ] **Step 5: Commit**

  "Block imports between the apps".

---

### Task 3: Check that the clinical build carries no platform code

**Files:**

- Create: `scripts/platform-marker.mjs`, `scripts/check-no-platform-code.mjs`,
  `scripts/check-no-platform-code.test.mjs`
- Modify: `package.json` (script `check:bundle`)

**Interfaces:**

- Produces:
  - `PLATFORM_MARKER` (`"mhai-platform-app"`), exported from
    `scripts/platform-marker.mjs`;
  - `findPlatformCode(dir: string): Promise<string[]>`, exported from
    `scripts/check-no-platform-code.mjs`. It returns the paths, relative to
    `dir` and sorted, of every file under `dir` whose content contains
    `PLATFORM_MARKER`. It skips `cache/` folders.
  - Run as a CLI, `node scripts/check-no-platform-code.mjs <dir>`:
    - it exits 2 with "No build at <dir>. Run npm run build first." when
      `dir` is missing;
    - it exits 1 and lists the files when any are found;
    - otherwise it exits 0 and prints "No platform code in <dir>."
  - The root script: `"check:bundle": "node scripts/check-no-platform-code.mjs
apps/clinical/.next"`.

- [ ] **Step 1: Write the failing tests**

  The tests create fixtures in a temporary folder (`fs.mkdtemp` under
  `os.tmpdir()`). Tests in `scripts/check-no-platform-code.test.mjs`:
  - `"finds the marker in a nested chunk"`:
    - `static/chunks/a.js` contains `x="mhai-platform-app"`;
    - `server/app/page.js` is clean;
    - the result is `["static/chunks/a.js"]`.
  - `"a clean build passes"`: two clean files give `[]`.
  - `"skips the build cache"`: `cache/x.pack` contains the marker, and the
    result is `[]`.
  - `"the CLI fails on a missing build"`: spawn the CLI on a missing path;
    the exit code is 2 and stderr contains "No build at".
  - `"the CLI fails when it finds platform code"`: the exit code is 1 and
    stdout contains the file path.

- [ ] **Step 2: Run them to see them fail**

  Run `node --test scripts/check-no-platform-code.test.mjs`. Expected: they
  fail, because the module isn't found.

- [ ] **Step 3: Implement the module, the CLI and the `check:bundle` script**

- [ ] **Step 4: Run the tests, then the real check**

  Run `node --test scripts/`: all pass. Then `npm run build && npm run
check:bundle`: exit 0, printing "No platform code in apps/clinical/.next."

- [ ] **Step 5: Commit**

  "Check that the clinical build carries no platform code".

---

### Task 4: CI and the Docker image on the new paths

**Files:**

- Move: `Dockerfile` → `apps/clinical/Dockerfile`
- Modify: `apps/clinical/Dockerfile`, `.dockerignore`,
  `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**

- Consumes: the root scripts (Task 1) and `check:bundle` (Task 3).

- [ ] **Step 1: Update CI**

  In `ci.yml`:
  - add the step `Bundle check: npm run check:bundle` after Build;
  - change the e2e artifact paths to `apps/clinical/playwright-report/` and
    `apps/clinical/test-results/`.

  Keep the other steps as they are; the root scripts delegate.

- [ ] **Step 2: Update the Dockerfile and `.dockerignore`**
  - **The `deps` stage** copies `package.json`, `package-lock.json`,
    `apps/clinical/package.json` and `packages/tokens/package.json`, then
    runs `npm ci`.
  - **The `build` stage** runs `npm run build -w @mhai/clinical`.
  - **The `runtime` stage:**
    - copies `apps/clinical/.next/standalone` to `./`;
    - copies `apps/clinical/.next/static` to `./apps/clinical/.next/static`;
    - copies `apps/clinical/public` to `./apps/clinical/public`;
    - runs `CMD ["node", "apps/clinical/server.js"]`.

    Before relying on that layout, check it against the real standalone
    output.

  - **Keep** the env, the user, the port and the health check.
  - **`.dockerignore`:** make the entries match at any depth (`**/node_modules`,
    `**/.next`, `**/test-results`, `**/playwright-report`, `**/.feedback`).
    `.dockerignore` patterns without `**/` match the context root only.
  - **`deploy.yml`:** add `file: apps/clinical/Dockerfile` to the build step.
    Keep `context: .`.

- [ ] **Step 3: Build and run the image (Review Focus 2)**

  Build on the build server (amd64 is fine for this check), using
  `docker build -f apps/clinical/Dockerfile -t mhai-web:7a .`. Then run it
  with `-p 127.0.0.1:18090:8080`. Expected:
  - `curl` `/` gives 200;
  - `/c/x` gives 404;
  - the first `/_next/static/css/*.css` linked from the home page's HTML
    gives 200.

  Then remove the container and the image.

- [ ] **Step 4: Commit**

  "Build CI and the demo image from apps/clinical".

---

### Task 5: Move the design tokens to `packages/tokens`

**Files:**

- Create: `packages/tokens/package.json`, `packages/tokens/theme.css`,
  `packages/tokens/README.md`
- Modify: `apps/clinical/app/globals.css`, `apps/clinical/package.json`,
  `package-lock.json`

**Interfaces:**

- Produces:
  - `@mhai/tokens`, with `"exports": { "./theme.css": "./theme.css" }`;
  - `theme.css`, containing exactly today's `@theme { ... }` block from
    `globals.css` (the colours, fonts, `--radius-card` and `--shadow-card`).
    Plan 7b imports it the same way.

- [ ] **Step 1: Move the block**
  - Cut the `@theme` block from `globals.css` into `theme.css`, unchanged.
  - In `globals.css`, put `@import "@mhai/tokens/theme.css";` straight after
    `@import "tailwindcss";`.
  - Add `"@mhai/tokens": "*"` to the clinical dependencies and run
    `npm install`.
  - The README (a few lines) says what the package is: design v3 tokens,
    shared by both apps, and edited here only.

- [ ] **Step 2: Verify identical output (Review Focus 3)**
  - `npm run build`, then concatenate the CSS as in Task 1 Step 1. The
    `diff` against `baseline/app.css` shows no output. If the only
    differences are in ordering, compare the sorted declaration lists, and
    record that in the report.
  - The versions check (Task 1 Step 5) still shows no output.
  - `npm test`: 1457 passed.
  - `npm run lint`: clean. The Task 2 rule allows `@mhai/tokens`.

- [ ] **Step 3: Commit**

  "Move the design tokens to packages/tokens".

---

### Task 6: Docs on the new layout

**Files:**

- Modify:
  - `README.md`, `apps/clinical/tests/readme.test.ts`;
  - `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`;
  - `docs/adr/0002-separate-clinical-and-admin-apps.md`;
  - `deploy/README.md`, `CHANGELOG.md`.

- [ ] **Step 1: Write the failing README tests**

  Add these to `apps/clinical/tests/readme.test.ts`:
  - `"documents the workspaces and where the app lives"`: the README matches
    `/apps\/clinical/` and `/packages\/tokens/`.
  - `"says to move .env.local into apps/clinical"` (Review Focus 1): it
    matches ``/`\.env\.local`[^.]*apps\/clinical\//``.
  - Change the existing demo-command test's pinned string to
    `NEXT_PUBLIC_USE_MOCK=true npm run build && npm start`.
    `npx next start` no longer runs from the root. This is the one allowed
    assertion change. Keep its `not.toMatch` rule, with `npm start`.

  Run `npm test` and check that the three fail.

- [ ] **Step 2: Update the docs**
  - **README:**
    - the layout (apps, packages);
    - commands run from the root;
    - the demo command above;
    - `cd apps/clinical` is where per-app `npx` commands run;
    - the `.env.local` move.
  - **AGENTS.md and CONTRIBUTING.md:** paths such as `lib/offline/` become
    `apps/clinical/lib/offline/`; the commands stay the same.
  - **ARCHITECTURE.md §3:**
    - the tree and diagram show the layout as it is now, not "when admin
      work starts";
    - `apps/admin` becomes `apps/platform`;
    - the lint rule and the bundle check get a mention;
    - `packages/ui` and `packages/api-client` are marked "added with the
      platform admin app".
  - **ADR 0002:**
    - Status becomes Accepted;
    - `apps/admin` becomes `apps/platform`;
    - the follow-up line becomes "the restructure PR (Plan 7a)".

    The address `platforms.<domain>` is already right; check that no
    `admin.<domain>` remains anywhere in the repo, with `grep -rn
"admin\.<domain>\|admin\.&lt;domain" --exclude-dir=node_modules .`.
    Expected: only the historical note in ADR 0004.

  - **`apps/clinical/AGENTS.md`:** if `next dev` writes its agent-rules
    block into `apps/clinical/` (the root AGENTS.md says it re-adds that
    block), commit the generated file with one added line: "See the root
    `AGENTS.md` for this repository's rules." That keeps the tree clean.
- **`deploy/README.md`:** the Dockerfile path.
  - **`CHANGELOG.md`:** under Unreleased › Changed, say:
    - the repository is now npm workspaces: the app is in `apps/clinical`
      and the tokens are in `packages/tokens`;
    - there is no change to the app;
    - move a local `.env.local` into `apps/clinical/`.

- [ ] **Step 3: Verify**

  `npm test`: 1459 passed (1457 plus the 2 new tests). `npm run
format:check`: clean.

- [ ] **Step 4: Commit**

  "Document the workspace layout".

---

## Self-review notes

- **Spec coverage:**
  - §3 layout: Tasks 1 and 5, with `ui` and `api-client` deferred by
    ruling;
  - no imports between apps: Task 2;
  - no behaviour change, the unchanged suites and the bundle check: Tasks 1,
    3 and 5;
  - CI per app and the Docker image: Task 4;
  - ADR 0002 and ARCHITECTURE.md: Task 6;
  - §12 Plan 7a tests: Tasks 1, 2 and 3;
  - §14 its own PR: the whole plan.
- **Not covered here:** the platform Docker image and Cloudflare config
  (§3 deploys). They are Plan 7b, because there is no platform app to
  deploy yet.
- **Names used across tasks:**
  - `@mhai/clinical`, `@mhai/tokens` and `@mhai/platform`;
  - `PLATFORM_MARKER`;
  - `findPlatformCode`;
  - `check:bundle`;
  - `scripts/lockfile-versions.mjs`;
  - `baseline/` (in the plan workspace).
