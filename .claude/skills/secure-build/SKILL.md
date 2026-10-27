---
name: secure-build
description: Use before writing or changing any code in mhai-web (the clinical app, the platform admin app, packages/ui, packages/api-client). It holds the rules for building securely here: patient data in the browser, the BFF and proxy shapes, fail-closed readers, auth UI, auditor separation, wording and accessibility.
---

# Building securely in mhai-web

We build securely from the first line, not just at review time. Read CONTRIBUTING.md ("Patient data in the browser"), ADR 0002 and ADR 0003, and the spec's **Security and threat model** section first. The rules below are the ones this repo has learned, most of them from real review findings.

## Before you write code

1. **Name the attacker.** One line: the next person at a shared ward PC, an auditor trying a write, someone reading a CI report, a crafted reply from upstream, a page in another origin.
2. **Find the boundary.** Browser → BFF route → MHAI API, plus storage, the URL, the query cache, the console, files and test artefacts. Validate on the trusted side.
3. **Write the failing test first,** including the abuse case.

## Patient data in the browser

- **Nowhere but memory.** No patient name, MRN, filter, count or row in a URL (path or query), `localStorage`, `sessionStorage`, IndexedDB, a service-worker cache, `document.title`, `console.*`, analytics or an error message. The one exception is the encrypted offline outbox (`apps/clinical/lib/offline/`): AES-GCM under a non-extractable key, bound to the hashed user, 72-hour limit. Changing it needs `clinical-review` and a new sign-off.
- **Patient lists use `gcTime: 0`** and `staleTime: Infinity` with no refetch on reconnect (see `usePatients` in `apps/clinical/lib/analysis-queries.ts`). A refetch of a named list records a second view.
- **Named lists go in a POST body** (`POST analysis/patients/named`). The purpose and note never touch the URL. A GET patient list asking for any level but `deidentified` is refused in the BFF.
- **Names end** at `named_until`, on a clearance change, on `clearance_ended`, `not_cleared` or `named_access_off`, on a filter change and on sign-out.
- **No print, no export, no copy** for alerts, patient rows or clearance letters. A letter page is a server-drawn image held as a Blob in component state, shown through a `blob:` URL, never downloaded.
- **No names in test artefacts.** Any Playwright spec that renders names sets `test.use({ trace: "off", screenshot: "off", video: "off" })` and `process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1"` (turns off `error-context.md`), and checks in `afterEach` that URLs, the title, the console and storage hold no name or MRN. Copy `apps/clinical/tests/e2e/named-analysis.spec.ts`.
- **Synthetic data only** in code, fixtures, Storybook and screenshots.

## The BFF and the proxy

- **The browser never holds the token.** The session is an httpOnly cookie read only on the server; client code never reads it. The BFF adds `Authorization` and refreshes.
- **Forward exact shapes only.** Platform: add the `METHOD path` row to `SHAPES` in `apps/platform/app/api/v1/[...path]/route.ts` (`{id}` is one opaque id, never a word another shape uses), and the same row to the `SHAPES` list in `apps/platform/app/api/v1/proxy.test.ts`. Clinical: extend the shape function for the area (`hospitalShape`, `analysisShape`, `alertShape`), never `ALLOWED` alone. Never match by prefix.
- **Check everything before upstream:** shape, sign-off switch (404 while off), same origin for writes, session, owed first-sign-in steps, two-step, role. A refusal never reaches the API.
- **Trusted headers are set server-side.** Only the headers the BFF builds go upstream (`Accept`, `Authorization`, `Content-Type`, a valid `Idempotency-Key`). `x-nonce` and the CSP are set by `apps/platform/proxy.ts` on the request, overwriting anything the client sent. `X-MHAI-Background` is read, never forwarded. Never pass a client header through.
- **Never echo upstream text.** Refusals keep the problem code plus the few checked fields `refusal()` / `problem()` allow. File replies pass only as the types their shape lists, with `no-store` and `nosniff`; anything else is 502.
- **Writes drop the query string;** bodies are capped (64 KB, letters by `LETTER_MAX_BYTES`).
- **CSP.** The platform app has a strict nonce CSP with `'strict-dynamic'`, `frame-ancestors 'none'` and `connect-src 'self'`. Don't add inline scripts, third-party origins or `unsafe-*` outside development. The clinical app has no CSP header yet: write nothing that would stop it adopting the same policy.
- **The step-up code never lingers.** Use `useStepUp` (clinical) or `StepUpDialog` with `useStepUpCall` (platform). The mutation carrying a code or secret has `gcTime: 0` and is `reset()` after every answer; a refused code is cleared and the focus goes back to the box. Test it like `sso-section.test.tsx`: the mutation cache must not contain the secret.

## Fail-closed readers

- **Read every reply through the reader** (`apps/platform/lib/analysis/read.ts`, `apps/clinical/lib/analysis/read.ts`) and its guards (`@mhai/ui/guards` in the platform app, `apps/clinical/lib/analysis/guards.ts` in the clinical app). A change to `@mhai/ui/guards` needs `clinical-review`. Any value that should have been hidden fails the whole view ("Couldn't load {view}"): a shown 1–4, a hidden value sent with its number, an extra key, a patient key (`pid`, `mrn`, `dob`, ...), a wrong scope, period or hospital. One failed view never takes the others down.
- **Words, not numbers:** hidden counts show `FEWER_THAN_5` ("Fewer than 5"), hidden rates and shares "Not shown". Never a bar or a zero for a hidden value.
- **Close subtraction leaks.** Declare every whole/part pair (`PART_PAIRS`) and check it with `setGivesAway`, `numeratorLeaks` and `remainderLeaks`: a whole minus its shown parts of 1–4, a rate's complement, exactly one hidden member, and the same figure across scopes (one hospital vs all hospitals).
- **The CSV never holds more than the screen.** Build it from the screen's own tables (`viewTables`), with the same words. `csv-parity.test.tsx` renders every view in both scopes and compares cell by cell; a new view or column joins that test.

## Auth UI

- **Unknown and locked accounts look the same.** Use `authErrorCopy` / `auth-error.tsx`; never write "no such account" or branch on whether a login exists.
- **Sign-out clears all state:** the query and mutation caches (the platform app calls `queryClient.clear()` in `lib/auth/auth-context.tsx`), in-memory history, hand-offs (the Analysis scope hand-off), names, and the outbox on a manual sign-out.
- **"Switched off" gates are sticky.** After `analysis_off` or `named_access_off`, the feature stays off for the session; a refetch or a later 200 never turns it back on.
- **Writes carry an Idempotency-Key and a version.** Use `useKeyedMutation` (one key per call, reused on retries). A 409 (`conflict`, `already_handled`, `stale`, ...) shows who changed it and reloads; it never retries over the other person's change.

## Platform audience separation

- **An auditor makes no writes** except the rows in `AUDITOR_WRITES`, and reads no `ADMIN_ONLY_READS`. Hide write controls for auditors in the UI too, and test that an auditor's write is 403 before upstream.
- **Clinical sessions never reach platform routes,** and the clinical bundle carries no platform code (`npm run check:bundle`).

## Wording

- **No EMR vendor or product names anywhere**, including identifiers (`SomethingClient`, `vendor_fhir`). `scripts/no-vendor-names.test.mjs` splits identifiers and fails on any name in `scripts/vendor-names.mjs`. Show only the hospital's `source_label`; follow the API's `emr_link`.
- **No "lab" wording** in the UI; say "results" or the hospital's own label. No backend terms (`FORBIDDEN_TERMS` in `apps/clinical/lib/labels.ts`).

## Accessibility is part of correctness

- Focus moves to the dialog's first field on open and back to the trigger on close; a refused field takes the focus.
- Keyboard order reaches every control once. A scroll container is not a tab stop when its children are (the phone chart scroller regression, `1568c13`).
- Check phone layouts (the e2e `mobile` project): sheets instead of dialogs, nothing cut off.

## Before you commit

- [ ] Every new proxy shape is in `SHAPES` (route and test) or the shape function, with its roles and switch.
- [ ] No patient data in a URL, storage, title, log, cache after sign-out or test artefact.
- [ ] Every new figure goes through the reader and the guards, and the parity test covers it.
- [ ] Abuse-case tests went red before the fix.
- [ ] `npm run lint`, `typecheck`, `format:check`, `test`, `build` and `node --test "scripts/**/*.test.mjs"` pass.
- [ ] Run the `security-review` skill on your own diff.
