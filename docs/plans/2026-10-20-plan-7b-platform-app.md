# Plan 7b: The platform admin app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the platform admin app (`apps/platform`) for Measured Health staff, on sample data, deployed to `platforms.measured-health.org` behind an IP allowlist. It covers:

- sign-in with email, password and two-step (always);
- **Hospitals**: list, add with a first hospital admin invite, edit, deactivate, reactivate, two-person removal, and single sign-on;
- **Team**;
- **Activity**;
- **Account**.

Platform admins can do everything. Auditors read everything and change nothing.

**Architecture:**

- **A second Next.js app** in the workspaces, `@mhai/platform`, at `apps/platform`. Neither app imports from the other. Code both apps need moves into two new packages:
  - `@mhai/ui`: UI primitives, hooks and the code and password inputs;
  - `@mhai/api-client`: errors, the request helper, network and retry rules, keyed mutations, two-step helpers, and the server-side sealing and upstream call.

  The clinical app is rewired to import them, with no behaviour change.

- **The platform app has its own:**
  - BFF (`app/api/auth/*`, `app/api/v1/[...path]`) and sealed cookie (`mhai_platform_session`, secret `PLATFORM_SESSION_SECRET`);
  - auth client, provider and gates;
  - shell, screens and TanStack Query hooks.
- **Mock-first**, as in the clinical app: `NEXT_PUBLIC_USE_MOCK=true` swaps in an in-memory platform API and auth. The demo's sample data lasts for the browser tab, so a removal requested as one admin can be approved after signing in as the second.
- **Security:**
  - a strict nonce-based Content Security Policy, set in `apps/platform/proxy.ts`, so every page renders dynamically: no `cacheComponents`, no `partialPrefetching`;
  - the proxy forwards only exact `/platform/*` shapes, and refuses auditor writes and accounts without two-step;
  - a 15-minute idle limit on both the server and the screen;
  - no "trust this device";
  - step-up two-step codes on sensitive actions.
- **Deploy:** a second image (`ghcr.io/measured-health/mhai-web-platform`) and compose service (`platform`, `127.0.0.1:8091`), plus an nginx server block for `platforms.measured-health.org`. Its allow list is a host file the product owner maintains.

**Tech Stack:** Next.js 16.4 (App Router, `proxy.ts`, Turbopack), React 19.3, TanStack Query 5, zod 4, Tailwind 4 with `@mhai/tokens`, lucide-react, Vitest 5 and Testing Library, Playwright 1.64, `node:test`, Docker (arm64), nginx.

**Spec:** `docs/specs/2026-10-17-platform-admin-design.md` (the whole spec; Plan 7a delivered §3's move). Background: ADR 0002, ADR 0004, UI design v3 §6–§7, `ARCHITECTURE.md` §5–§6. The clinical code this plan reuses or mirrors is listed per task.

## Global Constraints

- **Names:**
  - workspaces `@mhai/platform` (`apps/platform`), `@mhai/ui` (`packages/ui`) and `@mhai/api-client` (`packages/api-client`), all `"private": true`;
  - the address is `platforms.<domain>` in docs and `platforms.measured-health.org` in deploy files.
- **Neither app imports from the other.** The Plan 7a lint rule enforces it. `npm run check:bundle` must still pass: the clinical build carries no `mhai-platform-app`. The platform root layout renders the marker as `<meta name="mhai-app" content="mhai-platform-app" />`.
- **No behaviour change in the clinical app**, with two exceptions:
  - its 403 page loses the "Go to the platform admin app" link, and `NEXT_PUBLIC_ADMIN_APP_URL` goes (spec §2: "with no link");
  - the Tailwind scan narrows from the repository root to the app and the packages (Plan 7a ruling R5).

  The clinical unit suite (1459) and e2e suite (119 passed, 1 skipped) pass with their assertions unchanged. Tests that move into a package keep their assertions.

- **Roles:**
  - the backend role `admin` (today's name, as in the clinical app) **or** `platform_admin` means platform admin;
  - `auditor` means auditor;
  - any other account gets "This account can't use the platform admin app" and is signed out.

  Both apps' `rolesOf` keep their own lists.

- **Codes:**
  - a wrong step-up code is **403 `mfa_invalid`**, too many wrong codes is **429 `mfa_locked`**, and no two-step is **403 `mfa_required`**. These follow the backend's existing codes, and spec §13 is corrected in Task 15;
  - a version clash is **409 `conflict`**;
  - removal approval: **409 `same_person`** and **409 `blocked`**;
  - team: **409 `last_admin`** and **409 `own_role`**;
  - an auditor write is **403 `forbidden`**.
- **Two-step:**
  - always required for platform accounts, with no skip;
  - there is no "trust this device" anywhere in the platform app;
  - demo code `123456`, demo backup codes as in the clinical mock.
- **Idle limit:** 15 minutes. The screen warns at 13 and signs out at 15. The server refuses a session idle for more than 15 minutes (401 `session_expired`).
- **Writes:**
  - every write sends an `Idempotency-Key` (`crypto.randomUUID()`, reused on retries);
  - the step-up actions send `mfa_code` or `backup_code`: deactivate, reactivate, request removal, approve removal, and remove a team member.
- **Privacy:** no patient data and no clinical content. Nothing is stored in localStorage, sessionStorage, IndexedDB or readable cookies, nothing goes in the URL beyond ids and filters, and nothing goes to analytics.
- **Copy:**
  - plain words, UI design §6;
  - status words are **Active**, **Set-up incomplete**, **Deactivated**, **Removal pending**, **Removal scheduled** and **Removed**;
  - deactivation reasons are **Contract ended**, **Security concern**, **At the hospital's request** and **Other** (with a note);
  - secrets show as "Saved · ends ··3f2a" (the last 4 characters);
  - no vendor names (ADR 0003), no "lab", no backend terms on screen.
- **Accessibility (UI §7):**
  - keyboard reachable with visible focus;
  - status words with icons (never colour alone);
  - 44 px targets on phones;
  - labelled dialogs and tables with headers;
  - reduced motion respected.
- **Look:**
  - design v3 tokens and `@mhai/ui` components;
  - a **"Platform"** label beside the logo;
  - the page header (top bar) on the `bloom` background with white text, where the clinical app's is light;
  - sidebar **Hospitals · Team · Activity · Account**;
  - tables on desktop and cards on phones.
- **Ports:**
  - platform `next dev` 3001;
  - platform e2e 3101;
  - container 8080, host `127.0.0.1:8091`, `mem_limit: 256m`.
- **Repo rules:**
  - no AI attribution in commits;
  - never `git add -f` under `.superpowers/`;
  - heavy commands run on the build server;
  - on the demo host, run `nginx -t` before any reload and never touch the EMR containers.

## Rulings made while planning

- **Shared code moves only where the platform app uses it now** (spec §3). It is moved with `git mv`, and the clinical imports are rewritten. Everything with clinical copy, routes or state stays in the clinical app. The platform app gets its own:
  - auth screens, built from the shared inputs, with platform copy;
  - auth context, with no outbox, alerts, SSO or trust device;
  - idle guard, with platform copy;
  - shell.

  Spec §6 says Account is "reused from the clinical app via `packages/ui`". Here that means the shared dialogs' inputs, not the clinical `AccountView`, which is tied to notifications, feedback and the outbox. Moving the whole Account would change the clinical app.

- **The Tailwind scan narrows here (Plan 7a R5).** Each app scans its own folder plus `packages/ui` (`@source`). Task 2 proves that the classes the narrowing drops are not used by any file in `apps/` or `packages/`.
- **The platform app turns off `cacheComponents` and `partialPrefetching`.** Nonce-based CSP requires dynamic rendering, and the Next 16.4 CSP guide says partial prerendering is incompatible with nonces.
- **Removal statuses:** a pending removal request has `checks` and `blocking` reasons. Approval moves the hospital to **Removal scheduled**. The mock completes it to **Removed** after 1 minute of demo time, or at once when a test advances the clock.
- **Clinical 403 page:** the link and `NEXT_PUBLIC_ADMIN_APP_URL` are removed (spec §2), and the README pin is updated in Task 15.
- **Backend contract:** Task 15 adds spec §13 (corrected) to backend PR #40. That is the controller's job after the plan's code lands, and it needs the product owner's go-ahead as an outward action.

## Review Focus

1. **An auditor tries a write by calling the API directly** (devtools or a stale tab), not through the hidden buttons. The proxy must refuse it with 403 `forbidden`, and the request must never reach the backend. Task 5 tests every write shape as an auditor.
2. **Two admins act on the same hospital at once:**
   - one edits while the other deactivates;
   - one approves a removal the other just cancelled.

   Each needs 409 `conflict` or a 404, then "Changed by someone else" and a reload, never a silent overwrite. Tasks 6, 10 and 11 test a stale `version` and an approve after cancel.

3. **A step-up code typed after the session has idled out, or after five wrong codes.** The user sees "Signed out after 15 minutes" or "Too many wrong codes, try again in 15 minutes", not a generic error, and the code is never kept in the query cache. Tasks 4, 7 and 10 cover idle expiry, `mfa_locked` and `gcTime: 0`.
4. **Long or awkward input:**
   - a 120-character hospital name;
   - an email domain list pasted with spaces and capitals;
   - a duplicate short code.

   The add form must normalise the domains (lower-case, trimmed, de-duplicated, each a valid domain) and show 409 `duplicate` as "That short code is already used". Tasks 6 and 9 test them.

5. **Phone layout for every list and dialog.** The cards, the reason-and-code dialog (a sheet on phones) and the removal checks must work at 390 px with 44 px targets. Task 15's phone e2e runs every main flow.

---

## File structure

```text
packages/api-client/           @mhai/api-client (moved from apps/clinical/lib, see Task 1)
  package.json · README.md · vitest.config.mts
  src/errors.ts                ApiError
  src/request.ts               createApiRequest, apiOk, keyHeader, RequestOpts
  src/network.ts               shouldRetry, isTransient, retryDelay, READ_RETRY, Network, useNetwork, usePollEvery, pollDelay
  src/keyed-mutation.ts        useKeyedMutation, WRITE_RETRY
  src/two-step.ts              totp, verifyTotp, normalizeBackupCode
  src/password-rules.ts        passwordRules, passwordError, COMMON_PASSWORDS
  src/server/seal.ts           seal, unseal (secret passed in)
  src/server/upstream.ts       UpstreamError, callUpstream
packages/ui/                   @mhai/ui (moved from apps/clinical/components/ui, lib/hooks, components/auth inputs)
  package.json · README.md · vitest.config.mts
  src/button.tsx banner.tsx chip.tsx cn.ts dialog.tsx sheet.tsx side-panel.tsx skeleton.tsx
  src/switch.tsx toast.tsx reason-form.tsx brand.tsx
  src/hooks/use-escape.ts use-focus-trap.ts modal-dialog.ts use-media.ts use-idle.ts use-now.ts use-online.ts
  src/auth/code-input.tsx backup-code-toggle.tsx password-fields.tsx qr-code.tsx backup-codes.tsx
apps/platform/                 @mhai/platform
  package.json · next.config.ts · tsconfig.json · vitest.config.mts · playwright.config.ts
  proxy.ts                     CSP nonce
  Dockerfile · .env.example
  app/layout.tsx providers.tsx globals.css not-found.tsx
  app/(auth)/sign-in/page.tsx  sign-in/code/page.tsx  welcome/page.tsx
  app/sign-out/page.tsx  app/no-access/page.tsx
  app/(app)/layout.tsx  hospitals/page.tsx  hospitals/new/page.tsx  hospitals/[id]/page.tsx
  app/(app)/team/page.tsx  activity/page.tsx  account/page.tsx
  app/api/auth/{login,mfa,mfa/setup,mfa/setup/confirm,mfa/recovery-codes,password,terms,session,logout,devices,devices/[id]}/route.ts
  app/api/v1/[...path]/route.ts
  lib/server/session.ts roles.ts http.ts
  lib/auth/types.ts client.ts mock.ts live.ts auth-context.tsx
  lib/api/contract.ts client.ts mock.ts live.ts fixtures.ts
  lib/queries.ts labels.ts errors.ts
  components/auth/* shell/* hospitals/* team/* activity/* account/* states/*
  tests/setup.ts render.tsx e2e/*.spec.ts e2e/helpers.ts
deploy/compose.yml (platform service) · deploy/nginx/mhai-platform.conf · deploy/README.md
.github/workflows/ci.yml · deploy.yml
```

---

### Task 1: `@mhai/api-client`: the shared request, retry and two-step helpers

**Files:**

- Move (`git mv`, then fix imports):
  - from `apps/clinical/lib/`: `network.ts`, `keyed-mutation.ts`, `auth/totp.ts`, `auth/codes.ts`, `auth/password-rules.ts`, plus their tests;
  - the `ApiError` part of `apps/clinical/lib/api/errors.ts`, and the generic part of `apps/clinical/lib/api/request.ts`.
- Create:
  - `packages/api-client/package.json`, `README.md`, `vitest.config.mts`;
  - `src/server/seal.ts`, `src/server/upstream.ts` (with tests).
- Modify:
  - `apps/clinical/lib/api/errors.ts`: keep `AlertHandledError` and `isAlertHandled`, and re-export `ApiError` from the package;
  - `apps/clinical/lib/api/request.ts`: keep the clinical `apiRequest` and `apiOk` signatures, built with `createApiRequest({ prefix: "/api/v1", onUnauthorized: reportUnauthorized })`;
  - `apps/clinical/lib/server/session.ts` and `apps/clinical/lib/server/api.ts`: use `seal`, `unseal` and `callUpstream` from the package, with no change to cookies or behaviour;
  - every clinical import of the moved modules;
  - `apps/clinical/package.json` (`"@mhai/api-client": "*"`), `apps/clinical/next.config.ts` (`transpilePackages`), `package-lock.json`.

**Interfaces:**

- **Package exports:** `"exports": { "./*": "./src/*.ts", "./server/*": "./src/server/*.ts" }`, imported as `@mhai/api-client/request`, `@mhai/api-client/server/seal` and so on. The package is TypeScript source compiled by each app (`transpilePackages: ["@mhai/api-client", "@mhai/ui"]`). Check the export-pattern syntax against TypeScript `moduleResolution: "bundler"` and Vitest. If `./*` cannot map to `.ts`, list each file explicitly.
- **Package `test` script:** `vitest run`, so the root `npm test` picks it up.
- Produces, with the same behaviour as today's clinical versions:
  - `ApiError`;
  - `shouldRetry`, `isTransient`, `retryDelay`, `READ_RETRY`, `Network`, `useNetwork`, `usePollEvery`, `pollDelay`;
  - `useKeyedMutation`, `WRITE_RETRY`;
  - `totp`, `verifyTotp`, `normalizeBackupCode`;
  - `passwordRules`, `passwordError`, `COMMON_PASSWORDS`.
- `createApiRequest(cfg: { prefix: string; onUnauthorized: () => void }) => { apiRequest(fetchImpl, path, opts?), apiOk<T>(fetchImpl, path, opts?) }`. Behaviour is today's: a network failure gives `ApiError(0,"network")`, and a 401 calls `onUnauthorized` and gives `ApiError(401,"session_expired")`.
- `keyHeader(opts?: { idempotencyKey?: string }): Record<string,string>` and `type RequestOpts`.
- `seal(value: unknown, secret: string): Promise<string>` and `unseal<T>(sealed: string, secret: string): Promise<T | null>`:
  - AES-256-GCM, key `sha256(secret)`, value `base64url(iv12 | tag16 | ciphertext)`, exactly as today;
  - throws `Error("secret too short")` when `secret.length < 32`.
- `class UpstreamError(status: number, code: string)` and `callUpstream<T>(base: string, path: string, opts: { method?; body?; token?; timeoutMs?: number; fetchImpl? }): Promise<T>`. This is today's `api()` with the base passed in. The clinical `api()` passes `apiBase()`.

- [ ] **Step 1: Write the failing package tests**
  - `seal.test.ts`:
    - `"round-trips a value"`;
    - `"a flipped bit unseals to null"`;
    - `"a different secret unseals to null"`;
    - `"refuses a short secret"`;
    - `"the format matches the clinical cookies"`: a value sealed by the pre-move clinical `seal` (fixture string committed in the test) unseals.
  - `upstream.test.ts`:
    - `"joins base and path and sends the bearer token"`;
    - `"a non-ok reply throws UpstreamError with the body's code"`;
    - `"a timeout throws UpstreamError(503,'unavailable')"`.
  - `request.test.ts`:
    - `"prefix is applied"`;
    - `"401 calls onUnauthorized once and throws session_expired"`;
    - `"network failure is ApiError 0 network"`.

  The moved tests (network, keyed-mutation, totp, codes, password-rules) move unchanged.

  Run `npm test -w @mhai/api-client`. Expected: the new tests fail (modules missing).

- [ ] **Step 2: Move and implement, then rewire the clinical app**

  Rewrite the clinical imports. The `@/lib/...` paths that remain (`lib/api/errors.ts`, `lib/api/request.ts`, `lib/server/api.ts`) keep their exported names, so clinical callers outside the moved files don't change.

- [ ] **Step 3: Verify**
  - `npm test`: the clinical suite still passes with no assertion changes. Its count drops by exactly the number of tests that moved, and the package count is that same number plus the new tests. Record both counts.
  - `npm run lint`, `npm run typecheck` and `npm run build` pass, and `npm run check:bundle` passes.
  - `NEXT_PUBLIC_USE_MOCK=true npm run e2e`: 119 passed, 1 skipped.
- [ ] **Step 4: Commit:** "Move shared request, retry and two-step helpers to @mhai/api-client".

---

### Task 2: `@mhai/ui`: shared components, hooks and inputs; narrow the Tailwind scan

**Files:**

- Move (`git mv`, with their tests):
  - from `apps/clinical/components/ui/`: `button`, `banner`, `chip`, `cn`, `dialog`, `sheet`, `side-panel`, `skeleton`, `switch`, `toast`, `reason-form`, `brand`;
  - from `apps/clinical/lib/hooks/`: `use-escape`, `use-focus-trap`, `modal-dialog`, `use-media`, `use-idle`, `use-now`, `use-online`;
  - from `apps/clinical/components/auth/`: `code-input`, `backup-code-toggle`, `password-fields`, `qr-code`, `backup-codes`.
- Create: `packages/ui/package.json`, `README.md`, `vitest.config.mts` (jsdom, a setup with jest-dom).
- Modify:
  - every clinical import of the moved modules;
  - `apps/clinical/app/globals.css`: add `@source "../../../packages/ui/src";`;
  - `apps/clinical/next.config.ts`: Tailwind `base` becomes the app folder (`import.meta.dirname`);
  - `apps/clinical/package.json`, `package-lock.json`.

**Interfaces:**

- Exports `"./*": "./src/*.tsx"` and `"./hooks/*": "./src/hooks/*.ts"`, plus `cn.ts` (use explicit entries where a pattern can't cover both `.ts` and `.tsx`). Imports look like `@mhai/ui/button`, `@mhai/ui/hooks/use-idle` and `@mhai/ui/auth/code-input`.
- Every moved component keeps its props and behaviour. Inside the package, imports are relative, never `@/`.
- `lucide-react`, `qrcode`, `clsx` and `react` become `peerDependencies` of `@mhai/ui`, at the versions the clinical app pins. No new dependency enters the lockfile.

- [ ] **Step 1: Baseline the CSS.** On the current tree, `npm run build` and save the concatenated CSS (`find apps/clinical/.next/static -name '*.css' | sort | xargs cat`) as `baseline/clinical.css` in the plan workspace.
- [ ] **Step 2: Move, rewire, and run the package tests.** `npm test -w @mhai/ui`: the moved tests pass unchanged.
- [ ] **Step 3: Narrow the scan and prove that nothing used is lost.**
  1. Build again and save `after.css`.
  2. Extract the class selectors from both files. List those present in `baseline` and missing from `after`.
  3. For each missing class, `grep -rF` for its unescaped name in `apps/` and `packages/` (outside `.next` and `node_modules`).

  Expected: no hits. Every dropped class came from `docs/` or `design/`. Put the list and the grep result in the report. If any class is used, add its folder to `@source` and repeat.

- [ ] **Step 4: Verify.**
  - `npm test`: the clinical count drops by exactly the moved tests, and nothing else changes.
  - `lint`, `typecheck`, `build` and `check:bundle` pass.
  - e2e: 119 passed, 1 skipped.
- [ ] **Step 5: Commit:** "Move shared components, hooks and code inputs to @mhai/ui; scan only the app and packages".

---

### Task 3: The platform app shell-less scaffold, CSP and the workspace wiring

**Files:**

- Create:
  - `apps/platform/package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.mts`, `playwright.config.ts`, `proxy.ts`, `.env.example`;
  - `app/layout.tsx`, `app/globals.css`, `app/not-found.tsx`, `app/page.tsx` (redirects to `/hospitals`);
  - `tests/setup.ts`, `tests/e2e/smoke.spec.ts`, `proxy.test.ts`.
- Modify:
  - root `package.json`: the scripts in Interfaces;
  - `.github/workflows/ci.yml`: platform e2e, and its report paths;
  - `apps/clinical/Dockerfile`: the deps stage copies `apps/platform/package.json`, `packages/ui/package.json` and `packages/api-client/package.json`;
  - `package-lock.json`.

**Interfaces:**

- **`@mhai/platform` scripts:**
  - `dev`: `next dev -p 3001`;
  - `build`: `next build`;
  - `start`: `next start -p 3001`;
  - `typecheck`: `next typegen && tsc --noEmit`;
  - `test`: `vitest run`;
  - `e2e`: `playwright test`.
- **Dependencies:** the same pinned versions as the clinical app, for `next`, `react`, `react-dom`, `@tanstack/react-query`, `zod`, `lucide-react`, `clsx` and `qrcode`, plus `@mhai/tokens`, `@mhai/ui` and `@mhai/api-client` (`"*"`). No new versions.
- **`next.config.ts`:**
  - `output: "standalone"`, with `outputFileTracingRoot` and `turbopack.root` set to the repo root;
  - the Tailwind loader as in the clinical app, with `base` set to this app's folder;
  - `transpilePackages`;
  - **no** `cacheComponents` and **no** `partialPrefetching`.
- **`proxy.ts`:**
  - `proxy(req)` makes a fresh base64 nonce per request;
  - it sets `Content-Security-Policy` to `default-src 'self'; script-src 'self' 'nonce-<n>' 'strict-dynamic'; style-src 'self' 'nonce-<n>'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`;
  - in development, it adds `'unsafe-eval'` to `script-src` (Next dev needs it), and nothing else;
  - it also sets `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` and `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
  - it passes the nonce to rendering in an `x-nonce` request header;
  - matcher `/((?!_next/static|_next/image|favicon.ico).*)`.

  Read `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` first. If Next's inline style tags need `'unsafe-inline'` for `style-src`, record that in the report rather than weakening `script-src`.

- **`app/layout.tsx`:**
  - the same fonts as the clinical app;
  - `<meta name="mhai-app" content="mhai-platform-app" />` (the value is `PLATFORM_MARKER`, imported from `../../scripts/platform-marker.mjs`; if that import is awkward, inline the same string and add a test that the two are equal);
  - `<html lang="en">`;
  - title template `"%s · MHAI Platform"`;
  - reads the nonce with `headers()`, so every page is dynamic.
- **Root scripts:**
  - `dev:platform`: `npm run dev -w @mhai/platform`;
  - `build`: `npm run build -w @mhai/clinical && npm run build -w @mhai/platform`;
  - `e2e`: `npm run e2e -w @mhai/clinical && npm run e2e -w @mhai/platform`;
  - `check:bundle` is unchanged. Add `check:platform-marker`, which runs `node scripts/check-no-platform-code.mjs apps/platform/.next` and **expects** a hit: a new `--expect-found` flag makes it exit 0 only when it finds the marker. CI runs both.
- **`playwright.config.ts`:** as in the clinical app, with port 3101, `NEXT_PUBLIC_USE_MOCK=true` and `PLATFORM_SESSION_SECRET` set to a 32+ character test value.

- [ ] **Step 1: Write the failing tests**
  - `scripts/check-no-platform-code.test.mjs`: `"--expect-found exits 0 when the marker is present and 1 when absent"`.
  - `apps/platform/proxy.test.ts`:
    - `"sets a CSP with a fresh nonce on each request"` (two calls give different nonces, and each appears in `script-src`);
    - `"never allows unsafe-inline scripts"`;
    - `"sets frame-ancestors 'none' and the other headers"`.
  - `tests/e2e/smoke.spec.ts`: `"the sign-in page loads with the CSP header and no console CSP errors"`. Go to `/sign-in`, check that `response.headers()["content-security-policy"]` contains `'nonce-`, and check that no console message contains "Content Security Policy". The sign-in page is a placeholder until Task 7, with heading "Sign in".
- [ ] **Step 2: Implement the scaffold.**
- [ ] **Step 3: Verify.**
  - `npm test` passes, including the new tests.
  - `npm run build` builds both apps.
  - `npm run check:bundle` prints "No platform code in apps/clinical/.next.", and `npm run check:platform-marker` exits 0.
  - `npm run e2e -w @mhai/platform`: the smoke test passes on desktop and mobile.
  - The clinical e2e is unchanged.
- [ ] **Step 4: Commit:** "Add the platform admin app scaffold with a strict content security policy".

---

### Task 4: Platform server: session, roles and the auth endpoints

**Files:**

- Create:
  - `apps/platform/lib/server/session.ts`, `roles.ts`, `http.ts`;
  - `apps/platform/lib/api/auth-contract.ts` (copy the clinical `ApiUser`, `ApiLoginOk`, `ApiMfaRequired`, `ApiSession` and `ApiDeviceToken` shapes);
  - `apps/platform/app/api/auth/{login,mfa,mfa/setup,mfa/setup/confirm,mfa/recovery-codes,password,terms,session,logout,devices,devices/[id]}/route.ts`;
  - the tests: `lib/server/session.test.ts`, `roles.test.ts`, `app/api/auth/auth.test.ts`.

**Interfaces:**

- **Cookies:**
  - `SESSION_COOKIE = "mhai_platform_session"` and `MFA_COOKIE = "mhai_platform_mfa"` (300 s);
  - options `{ httpOnly: true, secure: NODE_ENV === "production", sameSite: "strict", path: "/" }`, with no `domain`, so the cookie is host-only;
  - there is no trust cookie.
- **Secret:** `PLATFORM_SESSION_SECRET` (at least 32 characters) is read only on the server, and sealing uses `@mhai/api-client/server/seal`.
- `type PlatformRole = "platform_admin" | "auditor"`.
- `toPlatformRoles(apiRoles: string[]): PlatformRole[]`: `admin` or `platform_admin` gives `platform_admin`, `auditor` gives `auditor`, and everything else is dropped.
- `PlatformUser { id: string; email: string; name: string; roles: PlatformRole[]; mfaEnabled: boolean; backupCodesLeft: number | null }`.
- `ServerSession { token: string; expiresAt: number; lastSeenAt: number; user: PlatformUser; steps: FirstStep[] }`, where `FirstStep = "password" | "terms" | "mfa"`.
- **Session functions:**
  - `readSession(now)` returns `null` when the cookie is missing, unseals to null, has `expiresAt <= now`, or has `now - lastSeenAt > 15 * 60_000`;
  - `touchSession(s, now)` rewrites `lastSeenAt`;
  - `writeSession`, `clearSession`, `readMfa` and `writeMfa`;
  - `IDLE_LIMIT_MS = 900_000`.
- **Steps:** `stepsFor(apiUser)` adds `"mfa"` whenever `mfa_enabled !== true`, so two-step can never be skipped.
- **Auth routes.** They mirror the clinical `app/api/auth/*` routes, with these differences:
  - no `trust_device` and no `device_token`;
  - after login (and after MFA), a user whose `toPlatformRoles` is empty is signed out at once (the upstream logout is called) and gets 403 `{code:"not_platform"}`;
  - `session` GET returns 401 `session_expired` once idle;
  - every write checks `sameOrigin`;
  - bodies are validated with zod;
  - the upstream base comes from `MHAI_API_URL` plus `/api/v1`, with the platform audience header `X-MHAI-Audience: platform` on every upstream call (spec §13).

- [ ] **Step 1: Write the failing tests.** Mock `next/headers` cookies with a Map jar, and stub `fetch`, `PLATFORM_SESSION_SECRET` and `MHAI_API_URL`, as `apps/clinical/app/api/v1/proxy.test.ts` does.
  - `roles.test.ts`:
    - `"admin and platform_admin both map to platform_admin"`;
    - `"auditor maps to auditor"`;
    - `"clinician and hospital_admin are dropped"`.
  - `session.test.ts`:
    - `"a session idle for 15 minutes and 1 second reads as null"`;
    - `"a session idle for 14 minutes reads and touch moves lastSeenAt"`;
    - `"the cookie is host-only, httpOnly, strict"`;
    - `"stepsFor always owes mfa without two-step"`.
  - `auth.test.ts`:
    - `"login as a clinician account returns 403 not_platform and clears the cookie"`;
    - `"login never sends a device token"`;
    - `"mfa route ignores a trust_device field"` (the zod schema strips it, and no trust cookie is set);
    - `"session GET after idle returns 401 session_expired and clears the cookie"`;
    - `"a cross-origin POST is 403"`;
    - `"every upstream call carries X-MHAI-Audience: platform"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** `npm test -w @mhai/platform` and the lint. All pass.
- [ ] **Step 4: Commit:** "Add the platform session, roles and sign-in endpoints".

---

### Task 5: The platform BFF proxy

**Files:**

- Create: `apps/platform/app/api/v1/[...path]/route.ts`, `apps/platform/app/api/v1/proxy.test.ts`.

**Interfaces:**

- **Shapes** (`segments` after `/api/v1`, `{id}` matching `/^[A-Za-z0-9_-]+$/`). The upstream path is `/platform/...`; the browser calls `/api/v1/platform/...`.

  | Method | Shape                                         |
  | ------ | --------------------------------------------- |
  | GET    | `platform/hospitals`                          |
  | POST   | `platform/hospitals`                          |
  | GET    | `platform/hospitals/{id}`                     |
  | PATCH  | `platform/hospitals/{id}`                     |
  | POST   | `platform/hospitals/{id}/deactivate`          |
  | POST   | `platform/hospitals/{id}/reactivate`          |
  | POST   | `platform/hospitals/{id}/removal`             |
  | POST   | `platform/hospitals/{id}/removal/approve`     |
  | POST   | `platform/hospitals/{id}/removal/cancel`      |
  | GET    | `platform/hospitals/{id}/sso`                 |
  | PUT    | `platform/hospitals/{id}/sso`                 |
  | POST   | `platform/hospitals/{id}/sso/test`            |
  | POST   | `platform/hospitals/{id}/invites`             |
  | POST   | `platform/hospitals/{id}/invites/{id}/resend` |
  | GET    | `platform/team`                               |
  | POST   | `platform/team/invites`                       |
  | PATCH  | `platform/team/{id}`                          |
  | DELETE | `platform/team/{id}`                          |
  | GET    | `platform/activity`                           |

- **Order of checks:**
  1. The shape, else 404 `not_found`.
  2. A non-GET must pass `sameOrigin`, else 403.
  3. `readSession`: none or idle gives 401 `session_expired` and clears the cookie.
  4. `steps.length === 0`, else 403 `forbidden`.
  5. `user.mfaEnabled === true`, else 403 `mfa_required`.
  6. The roles are non-empty, else 403 `forbidden`.
  7. A **non-GET from an account without `platform_admin`** gives 403 `forbidden`, without calling upstream.

  Then `touchSession`. After that the clinical proxy's rules apply, with the same values:
  - refresh when less than 5 minutes are left;
  - 64 KB body limit, else 413;
  - `Idempotency-Key` forwarded only if it matches `/^[A-Za-z0-9-]{1,64}$/`;
  - the query string forwarded on GET only;
  - 30 s timeout, else 503 `unavailable`;
  - an upstream 401 clears the cookie and returns 401;
  - any other error returns only `{code}`, plus `{blocking}` on 409 `blocked`;
  - success is streamed with `no-store`;
  - every upstream call carries `X-MHAI-Audience: platform`.

- [ ] **Step 1: Write the failing tests.**
  - `"every listed shape is forwarded for a platform admin"`, a table test over the shapes above.
  - `"an auditor's write to every non-GET shape is 403 forbidden and fetch is never called"` (Review Focus 1).
  - `"an auditor can read every GET shape"`.
  - `"unknown shapes are 404"`: cases `platform/hospitals/x/y/z`, `hospital/staff`, `admin/users`, `platform/hospitals/../team` and `platform/hospitals/%2e%2e`.
  - `"an idle session is 401 session_expired"`.
  - `"no two-step is 403 mfa_required"`.
  - `"a bad Idempotency-Key is dropped, a good one forwarded"`.
  - `"409 blocked passes the blocking list through"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add the platform API proxy: exact paths, read-only auditors, two-step required".

---

### Task 6: The platform contract, the sample-data API and the live client

**Files:**

- Create: `apps/platform/lib/api/contract.ts`, `client.ts`, `mock.ts`, `live.ts`, `fixtures.ts`, with `mock.test.ts` and `live.test.ts`.

**Interfaces (`contract.ts`):**

```ts
type HospitalStatus =
  | "active"
  | "setup_incomplete"
  | "deactivated"
  | "removal_pending"
  | "removal_scheduled"
  | "removed";
type DeactivateReason =
  "contract_ended" | "security_concern" | "hospital_request" | "other";
type InviteStatus = "pending" | "accepted" | "expired";
type Person = { id: string; name: string };
type HospitalSummary = {
  id: string;
  name: string;
  short_code: string;
  status: HospitalStatus;
  staff_count: number;
  sso_enabled: boolean;
  created_at: string;
  last_activity_at: string | null;
};
type Hospital = HospitalSummary & {
  country: string;
  time_zone: string;
  email_domains: string[];
  version: number;
  deactivation: {
    by: Person;
    at: string;
    reason: DeactivateReason;
    note: string | null;
  } | null;
  first_admin: {
    invite_id: string;
    name: string;
    email: string;
    status: InviteStatus;
    sent_at: string;
    expires_at: string;
  } | null;
  removal: RemovalRequest | null;
};
type RemovalBlock = "legal_hold" | "retention" | "export_required";
type RemovalRequest = {
  status: "requested" | "scheduled" | "done";
  requested_by: Person;
  requested_at: string;
  reason: string;
  approved_by: Person | null;
  approved_at: string | null;
  checks: {
    legal_holds: number;
    retention_until: string | null;
    export_required: boolean;
    export_done: boolean;
  };
  blocking: RemovalBlock[];
};
type HospitalIn = {
  name: string;
  short_code: string;
  country: string;
  time_zone: string;
  email_domains: string[];
  first_admin: { name: string; email: string };
};
type HospitalPatch = Partial<
  Pick<
    HospitalIn,
    "name" | "short_code" | "country" | "time_zone" | "email_domains"
  >
> & { version: number };
type StepUp = { mfa_code: string } | { backup_code: string };
type SsoOut = {
  enabled: boolean;
  sign_in_url: string | null;
  client_id: string | null;
  issuer: string | null;
  allowed_domains: string[];
  secret_saved: boolean;
  secret_ends: string | null;
  last_test: { at: string; ok: boolean; message: string } | null;
  version: number;
};
type SsoIn = {
  enabled: boolean;
  sign_in_url: string;
  client_id: string;
  issuer: string;
  allowed_domains: string[];
  client_secret?: string;
  version: number;
};
type TeamRole = "platform_admin" | "auditor";
type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: "active" | "invite_pending";
  mfa_enabled: boolean;
  last_sign_in_at: string | null;
  is_you: boolean;
  version: number;
};
type ActivityAction =
  | "hospital_added"
  | "hospital_updated"
  | "hospital_deactivated"
  | "hospital_reactivated"
  | "removal_requested"
  | "removal_blocked"
  | "removal_approved"
  | "removal_cancelled"
  | "hospital_removed"
  | "sso_updated"
  | "sso_tested"
  | "admin_invited"
  | "admin_invite_resent"
  | "team_invited"
  | "team_role_changed"
  | "team_removed";
type ActivityEvent = {
  id: string;
  at: string;
  actor: Person;
  action: ActivityAction;
  hospital: Person | null;
  target: string | null;
  detail: string | null;
};
interface PlatformClient {
  listHospitals(q: {
    status?: HospitalStatus;
    q?: string;
    cursor?: string;
  }): Promise<{
    hospitals: HospitalSummary[];
    next_cursor: string | null;
  }>;
  addHospital(
    body: HospitalIn,
    opts: { idempotencyKey: string },
  ): Promise<Hospital>;
  getHospital(id: string): Promise<Hospital>;
  updateHospital(id: string, body: HospitalPatch, opts): Promise<Hospital>;
  deactivate(
    id: string,
    body: { reason: DeactivateReason; note?: string } & StepUp,
    opts,
  ): Promise<Hospital>;
  reactivate(
    id: string,
    body: { reason: string } & StepUp,
    opts,
  ): Promise<Hospital>;
  requestRemoval(
    id: string,
    body: { reason: string } & StepUp,
    opts,
  ): Promise<Hospital>;
  approveRemoval(id: string, body: StepUp, opts): Promise<Hospital>;
  cancelRemoval(id: string, opts): Promise<Hospital>;
  getSso(id: string): Promise<SsoOut>;
  saveSso(id: string, body: SsoIn, opts): Promise<SsoOut>;
  testSso(id: string, opts): Promise<SsoOut>;
  inviteAdmin(
    id: string,
    body: { name: string; email: string },
    opts,
  ): Promise<Hospital>;
  resendInvite(id: string, inviteId: string, opts): Promise<Hospital>;
  listTeam(): Promise<{ members: TeamMember[] }>;
  inviteTeam(
    body: { name: string; email: string; role: TeamRole },
    opts,
  ): Promise<TeamMember>;
  changeRole(
    id: string,
    body: { role: TeamRole; version: number },
    opts,
  ): Promise<TeamMember>;
  removeMember(id: string, body: StepUp, opts): Promise<void>;
  listActivity(q: { hospital?: string; cursor?: string }): Promise<{
    events: ActivityEvent[];
    next_cursor: string | null;
  }>;
}
```

(`opts` is `{ idempotencyKey: string }` on every write.)

- **`client.ts`:** `getPlatformClient()` returns the mock in mock mode, otherwise the live client. `__setPlatformClientForTests(c)` and `__resetPlatformClientForTests()` exist for tests.
- **`live.ts`:** `createLivePlatformClient({ fetchImpl })` uses `createApiRequest({ prefix: "/api/v1", onUnauthorized: reportUnauthorized })`, with the paths from Task 5 and `keyHeader`. `removeMember` sends DELETE with the step-up body.
- **`mock.ts`:** `createMockPlatform({ now, me: () => string | null, delayMs = 150, stepUp })`, with in-memory state seeded from `fixtures.ts`. The module singleton survives sign-out, so the two-admin demo works within one tab. It returns the same `ApiError(status, code)` errors the proxy would:
  - a version mismatch is 409 `conflict`;
  - a missing id is 404 `not_found`;
  - a short code already used is 409 `duplicate`;
  - invalid input is 422 `invalid`. Names are 1–120 characters; short codes match `/^[A-Z0-9]{2,8}$/` after upper-casing; domains are lower-cased, trimmed and de-duplicated, and each must match `/^[a-z0-9-]+(\.[a-z0-9-]+)+$/`;
  - a step-up by an account without two-step is 403 `mfa_required`, a wrong code is 403 `mfa_invalid`, and five wrong codes are 429 `mfa_locked`, reusing the clinical step-up rules: code `123456` and the backup codes;
  - deactivate is allowed only from `active` or `setup_incomplete`, and reactivate only from `deactivated`; anything else is 409 `conflict`;
  - request removal is allowed only from `deactivated`; it computes the `checks` and `blocking` from the fixture's legal holds, retention and export, and sets `removal_pending`;
  - approve gives 409 `same_person` when the approver is the requester, 409 `blocked` with `{blocking}` while any block remains, and 404 when nothing is pending. On success it sets `removal_scheduled`, and `now() >= approved_at + 60_000` makes the next read return `removed`;
  - cancel returns the hospital to `deactivated`;
  - team: removing or demoting the last active `platform_admin` is 409 `last_admin`, and changing your own role is 409 `own_role`;
  - an auditor's write is 403 `forbidden` (the mock checks `me()`'s role too, so screens behave as with the proxy);
  - every successful write logs an `ActivityEvent`;
  - invites expire after 7 days.
- **`fixtures.ts`:** six hospitals, with names not drawn from real organisations:

  | Hospital                      | State                                                                   |
  | ----------------------------- | ----------------------------------------------------------------------- |
  | Northgate General Hospital    | Active, SSO on, 214 staff                                               |
  | Riverside Children's Hospital | Active, SSO off, 96 staff                                               |
  | Eastbrook Medical Centre      | Set-up incomplete, first admin invite pending                           |
  | Westfield Clinic              | Deactivated, Contract ended, retention clear                            |
  | Harbour View Hospital         | Removal pending, requested by the second admin, blocked by 1 legal hold |
  | Southpoint Hospital           | Removal pending, requested by the second admin, all checks clear        |

  The team:
  - Ada Bakare (`ada.bakare@measured-health.example`, platform admin);
  - Tunde Okafor (`tunde.okafor@measured-health.example`, platform admin);
  - Amara Eze (`amara.eze@measured-health.example`, auditor);
  - Kemi Lawal (`kemi.lawal@measured-health.example`, auditor, invite pending).

  Plus 12 activity events.

- [ ] **Step 1: Write the failing tests** (`mock.test.ts`, with `delayMs: 0` and a fixed clock):
  - `"lists all six sample hospitals and filters by status and by name or short code"`;
  - `"add normalises domains and rejects a bad one"`: `" Northgate.ORG , northgate.org"` gives `["northgate.org"]`, and `"not a domain"` gives 422;
  - `"add with a used short code is 409 duplicate"`;
  - `"add creates a set-up-incomplete hospital with a pending first-admin invite"`;
  - `"a stale version is 409 conflict"` (Review Focus 2);
  - `"deactivate needs a valid code; wrong is mfa_invalid; five wrong is mfa_locked"`;
  - `"deactivate twice is 409 conflict"`;
  - `"request removal only from deactivated"`;
  - `"approve by the requester is same_person"`;
  - `"approve while a legal hold blocks is 409 blocked with ['legal_hold']"`;
  - `"approve after cancel is 404"` (Review Focus 2);
  - `"approve schedules, and a minute later reads as removed"`;
  - `"removing the last platform admin is last_admin; changing your own role is own_role"`;
  - `"an auditor's write is forbidden"`;
  - `"every write adds one activity event"`.

  `live.test.ts`: `"each method calls the right method and path with an Idempotency-Key"`, a table test, and `"removeMember sends DELETE with the code in the body"`.

- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests.**
- [ ] **Step 4: Commit:** "Add the platform API contract, sample data and live client".

---

### Task 7: Platform sign-in: auth client, provider, gates, first sign-in and idle sign-out

**Files:**

- Create:
  - `apps/platform/lib/auth/types.ts`, `client.ts`, `mock.ts`, `live.ts`, `auth-context.tsx`;
  - `components/auth/sign-in-form.tsx`, `code-form.tsx`, `welcome-flow.tsx`, `terms-step.tsx`, `new-password-step.tsx`, `mfa-setup.tsx`, `guest-gate.tsx`, `auth-gate.tsx`, `no-access.tsx`, `sign-out.tsx`, `demo-hint.tsx`, `auth-layout.tsx`;
  - `components/states/idle-guard.tsx`;
  - the pages `app/(auth)/sign-in`, `sign-in/code`, `welcome`, `app/sign-out` and `app/no-access`;
  - `app/providers.tsx`, `tests/render.tsx`, and a test file per component.

**Interfaces:**

- **`AuthClient`:** the clinical interface without `signInWithHospital`, `completeHospitalSignIn` or the trust option:
  - `getSession`, `signIn`, `verifyCode(code, { backup })`, `signOut`;
  - `acceptTerms`, `changePassword`, `startMfaSetup`, `confirmMfaSetup`, `regenerateBackupCodes`;
  - `listDevices`, `signOutDevice`, `signOutEverywhere`.

  `SignInResult` adds `{ status: "not_platform" }`.

- **`mock.ts`:** the accounts are the four team members from Task 6, plus `new.admin@measured-health.example`, who owes `["password","terms","mfa"]`. Any other email signs in as a clinician account and gets `not_platform`. The password is anything except `"wrong"`. Code `123456`. `SAMPLE_ACCOUNTS` lists Ada, Tunde, Amara and the new admin.
- **`AuthProvider`:**
  - state `{ status, user, steps, mfaPending }`;
  - `signOut(reason: "idle" | "manual" | "expired")` clears the query client and goes to `/sign-in`;
  - it subscribes to `onUnauthorized`;
  - `homeFor(s)` returns `/welcome` when steps are owed, otherwise `/hospitals`;
  - `isPlatformAdmin(user)` and `isAuditor(user)`.
- **Gates:**
  - `GuestGate` sends a signed-in user home;
  - `AuthGate` sends a guest to `/sign-in`, sends anyone owing steps to `/welcome`, and refuses an account with no platform role: it shows the `NoAccess` content and signs out.
- **Welcome flow:** password (if owed), then terms (`TERMS_VERSION = "2026-10"`), then two-step setup (QR, the code, then backup codes). There is no skip control at any step.
- **`IdleGuard`:** uses `useIdle` from `@mhai/ui`. It warns at 780 000 ms ("You'll be signed out in 2 minutes" with **Stay signed in**) and signs out at 900 000 ms with the reason `idle`. The sign-in page then shows "You were signed out after 15 minutes without activity."
- **Copy:**
  - sign-in heading "Sign in to MHAI Platform", fields "Work email" and "Password", button "Sign in";
  - the code page "Enter the 6-digit code from your authenticator app", with "Use a backup code instead";
  - `not_platform` gives "This account can't use the platform admin app." and is signed out;
  - the demo hint lists the sample accounts and the code `123456` (mock mode only).

- [ ] **Step 1: Write the failing tests:**
  - `"signs in as Ada with password then code and lands on /hospitals"`;
  - `"a wrong code shows the error and clears the input"`;
  - `"five wrong codes show 'Too many wrong codes. Try again in 15 minutes.'"` (Review Focus 3);
  - `"a clinician email shows the can't-use message and stays signed out"`;
  - `"the new admin must set a password, accept terms and set up two-step, with no way to skip"` (no button or link named /skip|later|not now/i at any step);
  - `"backup codes are shown once after two-step setup"`;
  - `"IdleGuard warns at 13 minutes and signs out at 15"` (fake timers);
  - `"Stay signed in resets the timer"`;
  - `"after an idle sign-out the sign-in page explains why"`;
  - `"no trust-this-device control exists"`.
- [ ] **Step 2: Implement.** Build the forms from `@mhai/ui` (`CodeInput`, `BackupCodeToggle`, `PasswordFields`, `QrCode`, `BackupCodes`, `Button`, `Banner`).
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add platform sign-in, first sign-in with required two-step, and the 15-minute idle sign-out".

---

### Task 8: The platform shell, page states and Account

**Files:**

- Create:
  - `apps/platform/components/shell/app-shell.tsx`, `sidebar.tsx`, `top-bar.tsx`, `mobile-drawer.tsx`, `account-menu.tsx`;
  - `components/states/loading.tsx`, `couldnt-load.tsx`, `empty.tsx`, `offline-strip.tsx`;
  - `components/account/account-view.tsx`, `change-password-dialog.tsx`, `backup-codes-dialog.tsx`, `devices-section.tsx`;
  - `app/(app)/layout.tsx` (`AuthGate` and `AppShell`), `app/(app)/account/page.tsx`;
  - `lib/queries.ts` (keys and the query client defaults);
  - tests.

**Interfaces:**

- **`AppShell`:**
  - on desktop (`xl`), a sidebar with `Logo`, the label **"Platform"** and links **Hospitals** (`/hospitals`), **Team** (`/team`), **Activity** (`/activity`) and **Account** (`/account`);
  - on phones, a menu button opens `MobileDrawer`;
  - `OfflineStrip`;
  - `IdleGuard`.
- **`TopBar({ title, sub?, actions? })`:** `bg-bloom text-white`. It has no notification bell.
- **States:**
  - `Loading`: a skeleton;
  - `CouldntLoad({ what, onRetry })`: "Couldn't load {what}." with **Try again**;
  - `Empty({ title, children })`;
  - offline: action buttons are disabled with "You're offline. This needs a connection."
- **`AccountView`:**
  - the profile: name, email and role ("Platform admin" or "Auditor");
  - two-step **On** (fixed: no turn-off control);
  - **Change password**;
  - **New backup codes** (with "{n} left");
  - **Devices**: the signed-in sessions, with **Sign out** each and **Sign out everywhere**;
  - there is no "trust" wording.

- [ ] **Step 1: Write the failing tests:**
  - `"the sidebar shows Platform and the four links in order"`;
  - `"the current page link has aria-current"`;
  - `"the top bar uses the platform header colour"` (class `bg-bloom`);
  - `"on a phone the menu button opens the drawer and Escape closes it"`;
  - `"CouldntLoad calls onRetry"`;
  - `"Account shows two-step On with no turn-off control"`;
  - `"New backup codes shows the new codes once"`;
  - `"signing out a device removes it"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add the platform shell, page states and Account".

---

### Task 9: Hospitals list and Add hospital

**Files:**

- Create:
  - `apps/platform/app/(app)/hospitals/page.tsx`, `hospitals/new/page.tsx`;
  - `components/hospitals/hospitals-view.tsx`, `hospital-table.tsx`, `hospital-cards.tsx`, `status-chip.tsx`, `add-hospital-form.tsx`;
  - `lib/labels.ts` (status, reason and action labels), `lib/errors.ts` (`platformError(e)`);
  - query hooks in `lib/queries.ts`: `useHospitals(filter)`, `useAddHospital()`;
  - tests.

**Interfaces:**

- **`statusLabel(s: HospitalStatus)`:** Active, Set-up incomplete, Deactivated, Removal pending, Removal scheduled, Removed.
- **`StatusChip({ status })`:** an icon plus the word. Never colour alone.
- **`platformError(e): { title: string; body: string; stale: boolean; gone: boolean }`.** Codes:
  - `conflict` gives "Changed by someone else" / "Reload to see the latest." (`stale`);
  - `not_found` gives "This was removed or no longer exists." (`gone`);
  - `duplicate` gives "That short code is already used.";
  - `invalid` gives "Check the highlighted fields.";
  - `mfa_invalid` gives "That code didn't work. Try again.";
  - `mfa_locked` gives "Too many wrong codes. Try again in 15 minutes.";
  - `mfa_required` gives "Turn on two-step in Account first.";
  - `same_person` gives "A different platform admin must approve this.";
  - `blocked` gives "Removal can't go ahead yet.";
  - `last_admin` gives "There must always be at least one platform admin.";
  - `own_role` gives "You can't change your own role.";
  - `forbidden` gives "Your account can only view this.";
  - `network` or any 5xx gives "Couldn't reach the service. Try again."
- **The list:**
  - columns Name, Status, Staff, SSO (On/Off), Created, Last activity;
  - search by name or short code; a status filter (All plus the six statuses);
  - **Add hospital** only for platform admins;
  - cards on phones;
  - loading, empty ("No hospitals match", with Clear), "Couldn't load hospitals" and offline states.
- **The add form:**
  - Name, Short code, Country, Time zone (`Intl.supportedValuesOf("timeZone")`), Allowed email domains (comma or new line), First hospital admin (name and email);
  - a client-side check with the same rules as the mock;
  - on success it goes to the new hospital's page with a toast "Hospital added. Invite sent to {email}.";
  - an auditor who visits `/hospitals/new` sees "Your account can only view this." and no form.

- [ ] **Step 1: Write the failing tests:**
  - `"lists the six sample hospitals with status words and icons"`;
  - `"search by short code finds the hospital"`;
  - `"status filter shows only deactivated"`;
  - `"an auditor sees no Add hospital button"`;
  - `"Couldn't load shows Try again, which refetches"`;
  - `"phone width renders cards"`;
  - `"add normalises pasted domains before sending"` (Review Focus 4);
  - `"a 121-character name is refused on the form"`;
  - `"a used short code shows 'That short code is already used.'"`;
  - `"Add is disabled offline with the reason"`;
  - `"success lands on the new hospital with Set-up incomplete"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add the hospitals list and Add hospital".

---

### Task 10: A hospital's page: details, deactivate and reactivate, first admin, recent actions

**Files:**

- Create:
  - `apps/platform/app/(app)/hospitals/[id]/page.tsx`;
  - `components/hospitals/hospital-view.tsx`, `details-section.tsx`, `status-section.tsx`, `step-up-dialog.tsx`, `first-admin-section.tsx`, `recent-actions.tsx`;
  - query hooks: `useHospital(id)`, `useUpdateHospital`, `useDeactivate`, `useReactivate`, `useInviteAdmin`, `useResendInvite`, `useActivity({ hospital })`;
  - tests.

**Interfaces:**

- **`StepUpDialog`:** `{ open, title, intro?, reasons?: {code,label}[], reasonLabel?, freeReason?: boolean, noteFor?: string, confirmLabel, tone: "danger" | "primary", busy, error, onClose, onConfirm(input: { reason?: string; note?: string } & StepUp) }`.
  - A dialog on desktop and a `Sheet` on phones.
  - Reason radios (or a free-text reason), with a note required when the reason is `other`.
  - The code is entered with `CodeInput` (autoSubmit off), or a backup code via `BackupCodeToggle`.
  - Focus goes to the first field.
  - A wrong code clears the input and refocuses.
  - The mutation that sends it uses `gcTime: 0`, so no code stays in the cache.
- **Details:**
  - a read view with **Edit**, platform admins only;
  - edit sends `version`;
  - 409 `conflict` shows "Changed by someone else" with **Reload**, keeps nothing, and refetches;
  - never overwrites.
- **Status:**
  - the status chip;
  - when deactivated, "Deactivated by {name} · {date} · {reason}";
  - **Deactivate** (reasons Contract ended / Security concern / At the hospital's request / Other, plus the code; the effect text is "All staff are signed out at once and can't sign in. Pending invites stop working. No data is deleted.");
  - **Reactivate** (a free-text reason plus the code; "Staff can sign in again. Old sessions are not revived.").
- **First hospital admin:**
  - name, email and the status chip (Pending, Accepted, Expired), plus "Expires {date}";
  - **Resend** while Pending or Expired;
  - **Invite** when none exists.
- **Recent actions:** the latest 5 events for this hospital, with "See all" linking to `/activity?hospital={id}`.
- **Auditors** see everything and no action buttons.

- [ ] **Step 1: Write the failing tests:**
  - `"shows details, status, first admin and recent actions"`;
  - `"edit then save sends the version and shows the saved values"`;
  - `"a stale save shows Changed by someone else and reloads without overwriting"` (Review Focus 2);
  - `"deactivate needs a reason and a code; Other needs a note"`;
  - `"a wrong code clears and refocuses; locked shows the 15-minute message"` (Review Focus 3);
  - `"after deactivating, the page shows Deactivated by Ada Bakare · date · Contract ended"`;
  - `"reactivate returns it to Active"`;
  - `"resend shows a toast and a new expiry"`;
  - `"an auditor sees no Edit, Deactivate, Reactivate, Resend or Request removal"`;
  - `"the step-up code is not kept in the query cache after success"` (the mutation cache has no entry containing `123456`);
  - `"at phone width the step-up opens as a sheet"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add the hospital page: details, deactivate, reactivate and the first admin invite".

---

### Task 11: Remove a hospital (two people, retention-aware)

**Files:**

- Create: `apps/platform/components/hospitals/danger-zone.tsx`, `removal-panel.tsx`, the query hooks `useRequestRemoval`, `useApproveRemoval` and `useCancelRemoval`, and tests.

**Interfaces:**

- **The danger zone:**
  - **Request removal** is enabled only when the hospital is Deactivated. Otherwise the text is "Deactivate the hospital first."
  - It opens a `StepUpDialog` with a free-text reason, the code, and the warning "Removal is permanent. After it's done only the audit trail remains."
- **The removal panel** (when `removal` is set):
  - "Requested by {name} · {date} · {reason}";
  - the checks in plain words:
    - "1 legal hold is active" (with the plural form);
    - "Records must be kept until {d MMM yyyy}";
    - "A data export is required" (and whether it is done);
    - "All checks are clear" when none block;
  - **Approve removal** shows for another platform admin only:
    - for the requester, the text is "Waiting for a different platform admin to approve";
    - while blocked, Approve is disabled with "Removal can't go ahead until the checks above are cleared." Legal holds are managed in a later release;
  - **Cancel request**, for any platform admin;
  - when scheduled: "Removal scheduled · approved by {name} · {date}";
  - when removed: "Removed. Only the audit trail remains." Every action button goes.

- [ ] **Step 1: Write the failing tests:**
  - `"request removal is disabled until deactivated"`;
  - `"request shows the checks and a blocked approve for the legal-hold hospital"`;
  - `"the requester sees 'Waiting for a different platform admin to approve'"`;
  - `"Ada approves Southpoint (requested by Tunde) with a code; it shows Removal scheduled"`;
  - `"a minute later the page shows Removed and no actions"`;
  - `"approve after the other admin cancelled shows 'This was removed or no longer exists.' and refreshes"` (Review Focus 2);
  - `"409 blocked from the server shows the plain-words checks"`;
  - `"cancel returns the hospital to Deactivated"`;
  - `"an auditor sees the panel but no actions"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add two-person hospital removal with retention and legal-hold checks".

---

### Task 12: Single sign-on for a hospital

**Files:**

- Create: `apps/platform/components/hospitals/sso-section.tsx`, the query hooks `useSso(id)`, `useSaveSso` and `useTestSso`, and tests.

**Interfaces:**

- **Fields:** Sign-in address (`https://` only), Client ID, Issuer, Allowed email domains, Client secret (write-only), and the **On/Off** switch.
- **The secret:**
  - once saved, it shows "Saved · ends ··{secret_ends}" with **Replace secret**;
  - the input is empty, `type="password"`, `autoComplete="off"`;
  - it is cleared from component state straight after a save, success or failure;
  - it is sent only when the user typed a new one.
- **Test sign-in:** shows the last test's result with its time ("Worked · 20 Oct 2026, 10:42" or "Didn't work: {message}").
- **Switching on:** needs a successful test after the last change. Otherwise the text is "Test sign-in first."
- **Switching off:** a confirm dialog, "Staff at {hospital} will sign in with email and password instead.", then Save.
- 409 `conflict` behaves as in Task 10.
- Auditors see the read view; the secret shows only "Saved · ends ··3f2a".

- [ ] **Step 1: Write the failing tests:**
  - `"a saved secret shows only its last four characters"`;
  - `"the secret field is empty after saving and the value never appears in the DOM"`;
  - `"saving without typing a secret sends no client_secret"`;
  - `"switching on needs a passing test"`;
  - `"switching off asks first"`;
  - `"a http:// sign-in address is refused"`;
  - `"an auditor sees no inputs"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add single sign-on set-up for a hospital with write-only secrets".

---

### Task 13: Team

**Files:**

- Create:
  - `apps/platform/app/(app)/team/page.tsx`;
  - `components/team/team-view.tsx`, `team-table.tsx`, `team-cards.tsx`, `invite-dialog.tsx`, `role-dialog.tsx`;
  - the query hooks `useTeam`, `useInviteTeam`, `useChangeRole` and `useRemoveMember`;
  - tests.

**Interfaces:**

- **Columns:** Name, Email, Role, Status (Active / Invite pending), Two-step (On/Off with an icon), Last sign-in.
- **Invite:** name, email and role (Platform admin / Auditor). Platform admins only.
- **Change role:** not offered on your own row ("You can't change your own role.").
- **Remove:** uses a `StepUpDialog` (code only), with "{name} loses platform access at once."
- **Server errors:** `last_admin` and `own_role` show the Task 9 wording.
- Auditors see the list only.

- [ ] **Step 1: Write the failing tests:**
  - `"lists the four team members with role, status and two-step"`;
  - `"invite adds an Invite pending row"`;
  - `"your own row has no Change role"`;
  - `"removing the last platform admin shows the last-admin message"`;
  - `"remove needs a code and the row disappears"`;
  - `"an auditor sees no Invite, Change role or Remove"`;
  - `"phone width renders cards"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add the Team page: invite, change role and remove with two-step".

---

### Task 14: Activity

**Files:**

- Create: `apps/platform/app/(app)/activity/page.tsx`, `components/activity/activity-view.tsx`, the query hook `useActivityFeed({ hospital })` (infinite, on `next_cursor`), and tests.

**Interfaces:**

- **`actionLabel(a: ActivityAction)`** gives plain sentences, for example:
  - "added the hospital";
  - "deactivated the hospital";
  - "requested removal";
  - "approved removal";
  - "changed {target}'s role";
  - "removed {target} from the team".
- **Rows:** "{actor} {action} · {hospital} · {time}", newest first.
- **Filter:** by hospital (select), from `?hospital=`.
- **Load more** follows `next_cursor`.
- Loading, empty and couldn't-load states.
- No CSV in this release.

- [ ] **Step 1: Write the failing tests:**
  - `"shows events newest first in plain words"`;
  - `"filters by hospital from the query string"`;
  - `"Load more appends the next page"`;
  - `"an action done in the app appears at the top after it"`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run the platform tests and lint.**
- [ ] **Step 4: Commit:** "Add the platform Activity page".

---

### Task 15: End to end, the clinical 403 link, docs and the corrected contract

**Files:**

- Create: `apps/platform/tests/e2e/helpers.ts`, `sign-in.spec.ts`, `hospitals.spec.ts`, `removal.spec.ts`, `team.spec.ts`, `security.spec.ts`.
- Modify:
  - `apps/clinical/components/auth/no-access.tsx` and its test: no link, and the text reads "Use the platform admin app.";
  - `apps/clinical/.env.example`: drop `NEXT_PUBLIC_ADMIN_APP_URL`;
  - `README.md`, `apps/clinical/tests/readme.test.ts`, `ARCHITECTURE.md` §5, `CHANGELOG.md`;
  - `docs/specs/2026-10-17-platform-admin-design.md`: §13 codes (`403 mfa_invalid` and `429 mfa_locked` replace `422 invalid_code`; the `admin` or `platform_admin` roles; the `X-MHAI-Audience: platform` header) and §16 "Changes during Plan 7b".

**Interfaces:**

- **`helpers.ts`:** `signIn(page, email)` (code `123456`), `expectNoStorage(page)` (empty storage and `document.cookie === ""`), `isMobile`.
- **README section "Platform admin app":**
  - how to run it (`npm run dev:platform`, then http://localhost:3001);
  - the demo accounts and code;
  - the six sample hospitals and what each shows;
  - the two-admin removal walkthrough;
  - the auditor;
  - "`PLATFORM_SESSION_SECRET` is required in live mode";
  - the allow-list note.

- [ ] **Step 1: Write the e2e specs.** Each runs on desktop and mobile, and `afterEach` runs `expectNoStorage`.
  - `"sign in with two-step and land on Hospitals"`.
  - `"the new admin can't skip two-step"`.
  - `"a clinician email can't use the platform app"`.
  - `"add a hospital, then it shows Set-up incomplete with a pending invite"`.
  - `"edit details"`.
  - `"deactivate with a wrong code, then the right one; then reactivate"`.
  - Removal, across two accounts in one tab:
    1. Ada requests removal of Westfield;
    2. she sees "Waiting for a different platform admin";
    3. she signs out;
    4. Tunde signs in and approves with `123456`;
    5. the page shows Removal scheduled.
  - `"the legal-hold hospital can't be approved"`.
  - `"team invite, change role and remove with a code; your own row can't be changed"`.
  - `"an auditor sees no actions anywhere"`.
  - `"an auditor's direct POST to the API is 403"` (`page.request.post`, Review Focus 1).
  - `"every page has a CSP header with a nonce"`.
  - `"the phone layout shows cards and the step-up as a sheet"` (Review Focus 5).
  - `"after 15 idle minutes the app signs out"` (`page.clock`).
- [ ] **Step 2: Docs and the clinical 403 change.** In `readme.test.ts`:
  - replace the `NEXT_PUBLIC_ADMIN_APP_URL` pin;
  - add `"documents the platform admin app demo"`, which matches `/\*\*Platform admin app\.\*\*/`, the four sample emails and `npm run dev:platform`.
- [ ] **Step 3: Verify.**
  - `npm test`;
  - `npm run e2e` (both apps; clinical 119 passed, 1 skipped);
  - `lint`, `typecheck`, `format:check`, `build`, `check:bundle` and `check:platform-marker`.
- [ ] **Step 4: Commit:** "Test the platform app end to end; document the demo; drop the clinical 403 link".

---

### Task 16: Deploy the platform app to platforms.measured-health.org

**Files:**

- Create: `apps/platform/Dockerfile`, `deploy/nginx/mhai-platform.conf`.
- Modify: `deploy/compose.yml`, `deploy/README.md`, `.github/workflows/deploy.yml`, `.dockerignore` (if needed).

**Interfaces:**

- **`apps/platform/Dockerfile`:** the clinical one's shape.
  - The deps stage copies every workspace's `package.json`.
  - The build runs `npm run build -w @mhai/platform` with `NEXT_PUBLIC_USE_MOCK=true`.
  - The runtime uses uid 1001 and `PORT=8080`, copies `apps/platform/.next/static` and the `public` folder if one exists, and runs `CMD ["node","apps/platform/server.js"]`.
  - `HEALTHCHECK` fetches `/sign-in`.
- **`compose.yml`:** a new service `platform`:
  - image `${PLATFORM_IMAGE:-ghcr.io/measured-health/mhai-web-platform:latest}`, `pull_policy: missing`, `restart: unless-stopped`;
  - `ports: ["127.0.0.1:8091:8080"]`, `mem_limit: 256m`, the same logging;
  - `environment: PLATFORM_SESSION_SECRET: ${PLATFORM_SESSION_SECRET:?set in /srv/mhai-web/.env}`.

  The `web` service is unchanged.

- **`mhai-platform.conf`:**
  - `server_name platforms.measured-health.org`;
  - `include /etc/nginx/mhai-platform-allow.conf;` (a host file with `allow <ip>;` lines that the product owner maintains), then `deny all;`;
  - the same proxy headers as the demo, plus `X-Robots-Tag: noindex, nofollow`;
  - `proxy_pass http://127.0.0.1:8091`;
  - a comment saying certbot adds the 443 block, and that the allow and deny rules must stay in it.
- **`deploy.yml`:**
  - the build job becomes a matrix of `{ name: web, file: apps/clinical/Dockerfile, image: ghcr.io/${{ github.repository }} }` and `{ name: platform, file: apps/platform/Dockerfile, image: ghcr.io/${{ github.repository }}-platform }`;
  - the deploy step pulls and restarts `web` and `platform`, and health-checks both:
    - `127.0.0.1:8090/` gives 200 and `/c/x` gives 404;
    - `127.0.0.1:8091/sign-in` gives 200, and the response has a `content-security-policy` header;
  - on failure it prints the logs of both services.
- **`deploy/README.md`:** one-time setup for the platform:
  - DNS, already done;
  - put `PLATFORM_SESSION_SECRET` (`openssl rand -base64 48`) in `/srv/mhai-web/.env`, mode 600;
  - create `/etc/nginx/mhai-platform-allow.conf`;
  - link the site and run `nginx -t` before reloading;
  - `certbot --nginx -d platforms.measured-health.org`, then confirm the allow and deny rules are in the 443 block;
  - check from an address not on the list that you get 403.

- [ ] **Step 1: Build and run the platform image on the build server**
  1. `docker build -f apps/platform/Dockerfile -t mhai-web-platform:7b .`
  2. Run it with `-e PLATFORM_SESSION_SECRET=<32+ chars>` on `127.0.0.1:18091`.
  3. Expected: `/sign-in` gives 200 with a CSP header; `/api/v1/platform/hospitals` without a session gives 401; the image contains no `.env` file.
  4. Remove the container and the image.
- [ ] **Step 2: Check the nginx file syntax** in a throwaway `nginx:stable` container: `nginx -t` with a dummy allow file.
- [ ] **Step 3: Commit:** "Deploy the platform admin app to platforms.measured-health.org behind an allow list".

The first deploy (setting up the secret, the allow file, the nginx link and the certificate on the demo host) is a separate, confirmed step for the controller and the product owner after merge. It is not part of this task.

---

## Self-review notes

- **Spec coverage:**

  | Spec section                                   | Task(s)                                                  |
  | ---------------------------------------------- | -------------------------------------------------------- |
  | §2 roles                                       | 4, 5, 7, and the auditor checks in 9–14                  |
  | §3 packages                                    | 1, 2                                                     |
  | §4 origin, network, session, CSP               | 3, 4, 5, 16                                              |
  | §4 idle limit and no trust                     | 4, 7                                                     |
  | §4 Idempotency-Key and audit                   | 6, 14                                                    |
  | §4 step-up                                     | 10, 11, 13                                               |
  | §5 sign-in and first sign-in                   | 7                                                        |
  | §6 look, sidebar, states, phones               | 8, 9                                                     |
  | §7.1 list                                      | 9                                                        |
  | §7.2 add                                       | 9                                                        |
  | §7.3–7.5 hospital page, deactivate, reactivate | 10                                                       |
  | §7.6 removal                                   | 11                                                       |
  | §8 SSO                                         | 12                                                       |
  | §9 Team                                        | 13                                                       |
  | §10 accessibility                              | all UI tasks, 15                                         |
  | §11 demo                                       | 6, 7, 15                                                 |
  | §12 testing                                    | 15                                                       |
  | §13 contract                                   | 5, 6, 15 (corrected codes), and PR #40 by the controller |
  | §14 delivery                                   | this plan                                                |

- **Names used across tasks:**
  - `PlatformRole`, `PlatformUser`, `toPlatformRoles`;
  - `SESSION_COOKIE`, `IDLE_LIMIT_MS`;
  - `PlatformClient`, `getPlatformClient`, `createMockPlatform`, `createLivePlatformClient`;
  - `StepUp`, `StepUpDialog`, `platformError`;
  - `statusLabel`, `StatusChip`, `actionLabel`;
  - `createApiRequest`, `seal`/`unseal`, `callUpstream`, `UpstreamError`;
  - `PLATFORM_MARKER`, `check:platform-marker`.
