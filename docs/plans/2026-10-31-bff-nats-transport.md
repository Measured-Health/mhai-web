# BFF over NATS: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the server side of both apps (the BFF: route handlers and `lib/server/` in `apps/clinical` and `apps/platform`) reaches the core service over **NATS** instead of HTTP, behind a per-app switch `BACKEND_TRANSPORT=http|nats` that defaults to `http` until NATS is proven. The same change brings the clinical `contract.ts` and its screens in line with core's contract v1.2.0. The product owner said "do it" on 31 Oct.

**Architecture:**

- **One transport function per app,** shaped like `fetch`. Every place the BFF calls core today (`callUpstream` in `@mhai/api-client`, the two `/api/v1/[...path]` proxies) calls it instead of `fetch`. With `http` it is `fetch` plus the trusted headers; with `nats` it turns the request into one NATS request on `api.v1.<app>` and the reply back into a `Response`. Nothing above it changes: shapes, session, refresh, refusals and file checks stay as they are.
- **One NATS connection per app process,** opened by the server only (nats.js over TCP), as its own NKey user (`bff_clinical`, `bff_platform`) with inbox prefix `_INBOX_bff.<app>`. It never reaches the browser bundle: `server-only`, an import rule and a build check.
- **Parity by construction:** the existing BFF unit suites run twice in CI, once per transport. On `nats` an in-memory fake of core's adapter sits between the transport and the suites' stubbed `fetch`, so every assertion is unchanged. A real NATS and core (the backend's smoke stack) and a short live Playwright suite prove it end to end, on both transports, on steven-reid.

**Tech Stack:** Next.js 16.4 (route handlers, `instrumentation.ts`, `serverExternalPackages`), Node 24, nats.js v3 (`@nats-io/transport-node` and `@nats-io/nats-core`, exact versions pinned in the lockfile), Vitest 5, Playwright 1.64, Docker Compose on the preview instance.

**Spec and background (backend repo, Measured-Health/mhai-multiagent, `main` at `220ed33`):**

- ADR 0011 (`docs/adr/0011-frontend-ingress-over-nats.md`): the BFF is a NATS client; its NATS identity replaces the `X-MHAI-Service` key.
- `docs/specs/2026-10-28-intelligence-boundary-design.md` §17 (the frontend ingress) and §18 (as built: 405 and 413 on the NATS path, `handshake_first`, ...).
- `services/core/internal/natsapi/natsapi.go` and `headers.go`: the adapter this plan talks to. Its constants are quoted below; the code is the reference.
- `services/nats/nats.conf`, `services/nats/bff-clinical.test.conf`, `services/nats/README.md` ("Responders must check the reply subject").
- `services/core/openapi.yaml` v1.2.0 (`trust_band`, `cited_chunk_ids`, the codes `unavailable`, `method_not_allowed`, `payload_too_large`).
- `deploy/` (the demo's NATS, NKeys and the `mhai-bff` network) and `TODO.md` (the `CORE_HTTP_API` and `contract.ts` entries).

**Starting point:** mhai-web `main` at `fd0210f`.

## What is real today

Read before planning; each point shapes a ruling below.

1. **The demo never calls the backend.** Both Dockerfiles bake `NEXT_PUBLIC_USE_MOCK=true` into the build ("The demo always runs on sample data"), and neither compose file sets `MHAI_API_URL`. demo.measured-health.org and platforms.measured-health.org run entirely on sample data. CI's e2e runs in mock mode only.
2. **Live mode exists in code, behind `NEXT_PUBLIC_USE_MOCK` unset or `false`.** Then the browser calls the app's own `/api/*` routes, and the BFF calls core at `MHAI_API_URL`:
   - `@mhai/api-client/server/upstream` `callUpstream` (15 s timeout), used through `apps/clinical/lib/server/api.ts` `api()` and `apps/platform/lib/server/http.ts` `api()` (which adds `X-MHAI-Audience: platform` through `platformFetch`). Callers: every `app/api/auth/**` route in both apps, `lib/server/refresh.ts` in both, and the clinical `app/api/feedback` route.
   - `apps/clinical/app/api/v1/[...path]/route.ts` (`fetch`, 30 s) and `apps/platform/app/api/v1/[...path]/route.ts` (`platformFetch`, 30 s): the same-origin proxies with their shape allow-lists (clinical shape functions; platform `SHAPES`).
3. **Of what live mode calls, core serves only sign-in and questions.** Core's contract has the probes, `auth/*` (login, refresh, MFA, password, logout, terms, sessions) and `queries` (`POST /queries`, `GET /queries/{id}`, `GET /queries/{id}/result`). Everything else the live clients call (feedback, corrections, hospital admin, alerts, analysis, clearances, every `platform/*` route) is still an assumed contract (TODO.md, "Backend contracts still marked Assumed") and would be 404 from core today, on either transport.
4. **Today's HTTP path can't work against core as built.** The BFF sends neither `X-MHAI-Service` (core answers 401 to every non-probe route without it) nor `X-MHAI-Client-IP` (core refuses a sign-in without it: 503 `not_ready`, `auth/login.go`). The clinical app sends no `X-MHAI-Audience` (core defaults to `clinical`, so that one is fine). So live HTTP has never been exercised against the real core; the BFF's tests stub `fetch`.
5. **On the demo host, no container can reach core over HTTP.** Core publishes only `127.0.0.1:8092` on the host and sits on the `backend` and `edge` networks; the shared network `mhai-bff` (internal) carries only NATS (`mhai-nats:4222`). A container's 127.0.0.1 is its own.
6. **The demo's NATS already has the clinical BFF user** (`NATS_BFF_NKEY`: publish `api.v1.clinical`, subscribe `_INBOX_bff.clinical.>`), with its seed in `/srv/mhai-backend/.env` as `NATS_BFF_NKEY_SEED`. **There is no `bff_platform` user on the demo** (dev compose has a password one).
7. **Core's NATS adapter** (`natsapi`):
   - subjects `api.v1.clinical` and `api.v1.platform`, queue group `core`;
   - request headers it reads: `Mhai-Method` (exactly one; `GET HEAD POST PUT PATCH DELETE`, else 405 `method_not_allowed`), `Mhai-Path` (exactly one; origin-form under `/api/v1/`, at most 2048 bytes of printable ASCII, no `#`, else 404 `not_found`), `Mhai-Timeout-Ms` (optional; a positive whole number below 30000 shortens the 30 s deadline, anything else is ignored);
   - request headers it passes to the handler chain (matched in any case): `Authorization`, `Content-Type`, `Idempotency-Key`, `If-None-Match`, `X-MHAI-Client-IP`, `traceparent`. Everything else is dropped, `X-MHAI-Service`, `X-MHAI-Audience`, `X-Request-ID` and `tracestate` included;
   - body at most 64 KB (`httpx.MaxBody`), else 413 `payload_too_large`;
   - **the reply status is in the header `Mhai-Status-Code`** (`natsapi.HeaderStatus`), a decimal string. The reply's other headers are only `Content-Type`, `Cache-Control`, `ETag`, `Retry-After`, `X-Request-ID`, `Idempotent-Replayed`, `Deprecation`, `Sunset`, `Link`, `X-Content-Type-Options`, spelled exactly so. A `HEAD` reply has no body;
   - the reply subject must be `_INBOX_bff.<app>.` followed by literal tokens, at most 256 bytes; anything else gets **no reply at all** (the BFF sees a timeout);
   - a full pool (256 in flight per core copy) is 503 `unavailable` at once; a reply over the NATS payload limit (1 MB) is 500 `internal_error`;
   - probes (`/healthz`, `/readyz`) and the docs are **not** served over NATS.
8. **Spec §17.5:** no responders or a timeout on `api.v1` is the BFF's own 503 `unavailable`. That is exactly what both proxies and `callUpstream` already answer when `fetch` throws.

## Global Constraints

- **Server side only.** nats.js, the seed and the connection never reach the browser bundle. Every module that touches them starts with `import "server-only"`; an ESLint rule limits `@nats-io/*` to `packages/api-client/src/server/nats/**`; a build check fails if a client chunk holds any NATS marker (Task 6).
- **Nothing else in the BFF changes.** Shapes, sign-off switches, session handling, refresh, `refusal()` / `problem()`, file-type checks, body caps and the browser-facing codes stay byte for byte. The only call-site edits are `fetch` → the transport function, and a `timeoutMs` passed beside the existing `AbortSignal`.
- **Fail closed.** Anything unexpected on the NATS path (no connection, no responders, timeout, a reply without exactly one valid `Mhai-Status-Code`, a header that won't encode) is a thrown error, which the existing `catch` turns into 503 `unavailable`. Never a guessed status, never a retry inside the transport.
- **Only the BFF builds headers.** The transport sends only the allow-listed headers, from values the BFF set; it never copies a header from the browser's request. `Mhai-*` headers come only from the mapping.
- **No secrets in images, env dumps or logs.** The NKey seed is a file mounted as a Compose secret, read once at connect. The HTTP-only service key, while it exists, is a file too.
- **Logging:** app, method, status, duration, core's `X-Request-ID` and connection events only. Never a token, a seed, a body, a query string or a full path.
- **Default `http`.** Each app reads `BACKEND_TRANSPORT` at startup: `http` (default) or `nats`; anything else refuses to start the transport (every call 503, logged once).
- **Wording:** no backend terms in the UI (`FORBIDDEN_TERMS`), no vendor names, no "lab" wording.
- **Repo rules:** heavy runs (`npm ci`, `next build`, Vitest suites, Playwright, Docker, the backend stack) on steven-reid through `.remote-run.sh`; GitHub Actions confirms. Never push to `main`. No AI attribution in commits.

## Rulings made while planning

- **R1. The transport is a `fetch`-shaped function, not a new client.** `createBackendFetch({ app, ... })` returns `(url, init) => Promise<Response>`. The callers already handle a `Response` and a thrown error; keeping that shape is what makes "nothing else changes" true and lets one test suite run on both transports.
- **R2. The URL's origin selects nothing on NATS.** In `nats` mode `apiBase()` returns `http://core.nats.invalid/api/v1` (the `.invalid` name never resolves, so if it ever reached `fetch` it fails closed). The transport accepts only that origin and a path under `/api/v1/`; anything else throws. `MHAI_API_URL` is not needed on `nats`.
- **R3. Client IP on both transports.** Core needs `X-MHAI-Client-IP` for sign-in (fact 4). The app reads it from the one header the host's nginx overwrites, named by `TRUSTED_CLIENT_IP_HEADER` (the demo's sites set `X-Real-IP $remote_addr`), through `next/headers` inside the request, checks it is an IP literal (`node:net` `isIP`), and passes it to the transport. Unset or invalid: the header is omitted and core fails sign-in closed. No call site changes for this: each app's `lib/server/backend.ts` reads it.
- **R4. The HTTP transport gains `X-MHAI-Service`** from `BFF_SERVICE_KEY_FILE`, so the HTTP side of the parity runs works against a real core on steven-reid. It lives only as long as the HTTP transport, which a later PR removes once core turns `CORE_HTTP_API` off. On `nats` the key is never read.
- **R5. Timeouts.** The caller passes `timeoutMs` (15 000 for `callUpstream`, 30 000 for the proxies, as today). The transport sends `Mhai-Timeout-Ms` = `timeoutMs − 500` (at least 1000), so core gives up before the BFF does and its reply, if any, isn't wasted; the NATS request itself times out at `timeoutMs`. `init.signal` still aborts the wait.
- **R6. Size.** The transport refuses a body over 64 KB itself, with the same reply core would give (413, `{ "code": "payload_too_large" }` as `application/problem+json` on clinical, `{code}` on platform), and never publishes it. The JSON paths already cap at 64 KB before this; the one bigger body, the Plan 11 letter upload (up to `LETTER_MAX_BYTES` + 64 KB, multipart), has no core route yet and cannot ride `api.v1` as designed (see Open questions).
- **R7. The reply is buffered,** not streamed: one NATS message is at most 1 MB. The transport builds `new Response(body, { status, headers })` from the reply. The proxies' file checks (`Content-Type` against the shape's types) work unchanged.
- **R8. Readiness.** The clinical proxy forwards `GET readyz` today; core doesn't serve probes over NATS. In `nats` mode the clinical proxy answers `readyz` itself from the transport's readiness (200 `{}` when connected, 503 `{}` when not), which the live client's `getReadiness()` already reads as up or down. Each app also gets `GET /api/health` for Docker's health check (200 `{"status":"ok"}` or 503 `{"status":"unavailable"}`, no detail).
- **R9. Auth on NATS:** NKey only, except when `MHAI_DEPLOY_ENV=development`, where a user and a password file are also accepted (the backend's dev and smoke stacks use password users). TLS: required unless `MHAI_DEPLOY_ENV=development`; with TLS, a CA file and a client certificate and key (the production server has `verify: true`). The demo runs as development, like core there (product owner, 28 Oct).
- **R10. Connect early, never block a build.** `instrumentation.ts` `register()` opens the connection at server start when the transport is `nats` (Node runtime only); a call before it is up waits at most its own timeout. `next build` never connects (register doesn't run there, and the module connects lazily otherwise).
- **R11. No retries in the transport.** A lost reply on a write is the caller's to retry: the clients already reuse one `Idempotency-Key` per write (`useKeyedMutation`), so core replays instead of acting twice. Auth calls without a key behave as on HTTP.
- **R12. `trust_band` is typed, not shown.** Core calls it provisional. The confidence bars keep coming from `trust_score` and the safety rule (needs review never shows a confidence level). Showing the band waits for clinical sign-off (Open questions).

## Design

### The NATS client (`packages/api-client/src/server/nats/connection.ts`)

| Setting | From | Notes |
| --- | --- | --- |
| servers | `NATS_URL` | e.g. `nats://mhai-nats:4222` on the demo, `tls://...` in production. Required on `nats`. |
| auth | `NATS_NKEY_SEED_FILE` | Read once, checked to start with `SU`, passed to `nkeyAuthenticator`; the buffer is zeroed after the authenticator copies it. Development only: `NATS_USER` + `NATS_PASSWORD_FILE`. Both set, or neither: refuse. |
| inbox prefix | the app | `_INBOX_bff.clinical` or `_INBOX_bff.platform`, from the app name, never from the environment. |
| name | the app | `mhai-web-clinical` / `mhai-web-platform` (shows in NATS monitoring). |
| TLS | `NATS_TLS_CA_FILE`, `NATS_TLS_CERT_FILE`, `NATS_TLS_KEY_FILE` | All three required unless `MHAI_DEPLOY_ENV=development`. The BFF is INFO-first; the server's `handshake_first: 300ms` falls back to an ordinary TLS handshake for it (spec §18), once per process. |
| reconnect | fixed | Unlimited attempts, 2 s apart with jitter; `waitOnFirstConnect: true`; ping every 20 s, 2 missed pings mark it down. |
| readiness | `nc.status()` | `ready()` is true only while connected (after `connect`/`reconnect`, before `disconnect`/`reconnecting`/`close`). |
| shutdown | `SIGTERM` | `drain()` with a 5 s cap; in-flight requests finish or time out. |

- **One connection per process,** kept on `globalThis` under a symbol so dev hot reload doesn't open a second one.
- **Fail fast while down:** a request when `ready()` is false throws at once (503), rather than sitting in nats.js's reconnect buffer.
- **Logs** (through the app's server logger, never `console` with values): `nats: connected`, `nats: reconnecting`, `nats: disconnected`, `nats: closed`, `nats: config refused (<setting>)`. Never the URL's user info, the seed, a subject's reply token or a payload.

### The request mapping (`packages/api-client/src/server/nats/mapping.ts`)

Pure functions, no I/O, so every rule is a unit test.

`toNatsRequest(app, url, init)`:

| Today's HTTP request | NATS message |
| --- | --- |
| `app` | subject `api.v1.<app>` (`clinical` or `platform`; anything else throws) |
| `init.method` (default `GET`) | header `Mhai-Method`, upper-case, one of `GET HEAD POST PUT PATCH DELETE`, else throw |
| URL path and query | header `Mhai-Path` = `pathname + search`. The URL must have the origin `http://core.nats.invalid` and a path starting `/api/v1/`; at most 2048 bytes; printable ASCII only (the proxies already `encodeURIComponent` each segment); no `#`. Else throw |
| `Authorization`, `Content-Type`, `Idempotency-Key`, `If-None-Match`, `X-MHAI-Client-IP`, `traceparent` from `init.headers` | the same headers, one value each. Names matched without case; values must be 1–4096 bytes of printable ASCII (no CR, LF or NUL), else throw |
| any other header (`Accept`, `X-MHAI-Audience`, `X-MHAI-Service`, `X-MHAI-Background`, any `Mhai-*` ...) | dropped. `Accept` is HTTP-only; the audience is the subject's |
| `timeoutMs` | header `Mhai-Timeout-Ms` per R5 |
| body (`string` or `Uint8Array`) | message data, at most 64 KB, else the local 413 of R6 |

The reply inbox is not part of the mapping: nats.js sets it from the connection's `inboxPrefix`, as `_INBOX_bff.<app>.<nuid>.<token>`. The connection test checks it (Task 2), and the integration test proves core answers it (Task 8).

`fromNatsReply(app, msg)`:

| NATS reply | `Response` |
| --- | --- |
| `Mhai-Status-Code` | `status`. Exactly one value, a whole number 200–599, else throw (503) |
| the ten reply headers of fact 7 | the same headers. Any other header in the reply is dropped |
| data | body; none for `HEAD`, 204 and 304 |
| a NATS status reply (no responders) | throw (503 `unavailable`, spec §17.5) |
| timeout, abort, closed connection | throw (503 `unavailable`) |

### The switch (`packages/api-client/src/server/backend-fetch.ts`)

```ts
export type BackendApp = "clinical" | "platform";
export type BackendInit = RequestInit & { timeoutMs?: number };
export type BackendFetch = (url: string, init?: BackendInit) => Promise<Response>;

export function createBackendFetch(opts: {
  app: BackendApp;
  /** The end user's IP, read inside the request (R3); undefined outside one. */
  clientIp: () => Promise<string | undefined>;
  env?: NodeJS.ProcessEnv; // tests pass their own
  requester?: NatsRequester; // tests pass the fake core
}): BackendFetch;

export function backendReady(app: BackendApp): boolean; // http: true
export const NATS_API_ORIGIN = "http://core.nats.invalid";
```

- `http`: `fetch(url, { ...init, cache: "no-store", headers: + X-MHAI-Client-IP, + X-MHAI-Service })`.
- `nats`: `toNatsRequest` → `requester.request(subject, data, { headers, timeout })` → `fromNatsReply`.
- `NatsRequester` is the one-method interface the real connection and the test fake both implement.

## Security and threat model

Following both repos' `secure-design` skills. This plan moves a trust boundary (the BFF's link to core), so Task 11 records it in an ADR whose Consequences say so.

### Assets

- **The NKey seeds** of `bff_clinical` and `bff_platform`: whoever holds one can put any request on that app's `api.v1` subject, and core trusts `X-MHAI-Client-IP` on it.
- **Users' access tokens** (in `Authorization`), and on HTTP while it lasts, the BFF service key.
- **Request and reply bodies:** questions with synthetic (later real) patient details, results, MFA codes, passwords on sign-in and password change.
- **Hospital and audience separation:** a clinical session must never reach platform routes, and the reverse.
- **The audit trail's request ids** (core makes its own; none from the BFF may enter it).
- **Availability** of sign-in and questions; **clinical safety** (an escalated or degraded result always shows the review banner, whatever the transport).

### Actors and trust boundaries

```
browser ──https──> nginx (host) ──> app container (Next.js server = BFF)
                                     │  BACKEND_TRANSPORT=http: fetch ──> core HTTP (steven-reid tests only; not reachable on the demo)
                                     └─ BACKEND_TRANSPORT=nats: nats.js ──mhai-bff (internal)──> NATS ──> core (api.v1.<app>, queue core)
```

| Crossing | Checked there |
| --- | --- |
| browser → BFF route | unchanged: shapes, switches, same origin, session, steps, two-step, role, body caps. The browser has no NATS code, no NATS address and no credential (Task 6). |
| BFF → NATS | the connection's NKey (or, in development, password) user; NATS permissions: `bff_<app>` may publish only `api.v1.<app>` and subscribe only `_INBOX_bff.<app>.>`. TLS with `verify` outside development. |
| NATS → core | core's adapter: subject fixes the audience; reply prefix; method, path, size; header allow-list; then the full Plan 2 chain (token, session, MFA, route rule, RLS, audit). |
| core → BFF | the reply goes only to the inbox; the transport keeps only `Mhai-Status-Code` and ten headers; the proxies keep only the problem `code` and their checked fields, as today. |

### Threats (STRIDE) and their controls

| # | Threat | Control | Test |
| --- | --- | --- | --- |
| T1 | **Leaked seed (S, E).** Someone with `bff_clinical`'s seed connects to NATS and calls core as the BFF, with a stolen or their own token, and a forged client IP to dodge sign-in counters. | The seed alone gives nothing a user token doesn't: every route still needs a valid access token, session and MFA. NATS is not reachable from outside the host (`mhai-bff` is internal; the host port is loopback). The seed is a Compose secret file (mode 0400, uid 1001), never in the image, `docker inspect` env, logs or the repo; per-app users bound the blast radius to one app's subject. Rotation: a new pair from the backend's `setup-host.sh`, NATS restarted, the app restarted (deploy/README, Task 10). gitleaks already scans history. | A2, A3, A10 |
| T2 | **The browser sees NATS (I, E).** nats.js or the seed's path ends up in a client chunk, or a client component imports the transport. | `import "server-only"` in every transport module (the build fails on a client import); ESLint limits `@nats-io/*` and `@mhai/api-client/server/*` to server folders; `check:no-nats` scans `.next/static` for NATS markers after each build; nats.js is in `serverExternalPackages`, so it is `require`d at runtime, never bundled. | A1 |
| T3 | **Header smuggling (T, S).** A browser header (`X-MHAI-Client-IP`, `Mhai-Path`, `X-MHAI-Audience`, `traceparent`) reaches core; or a CR/LF in a value splits a NATS header; or two `Mhai-Method`s. | The proxies already build headers themselves; the mapping sends only its six allow-listed headers plus the three `Mhai-*` it sets, one value each, printable ASCII only, else throws. Core takes exactly one `Mhai-Method`/`Mhai-Path` and drops the rest too (defence in depth). The client IP comes only from the nginx-set header, checked as an IP literal. | A4, A5, A6 |
| T4 | **Reply subject abuse (T, E).** The requester chooses the reply subject, and core's one reply is a publish with core's rights (services/nats/README). A wrong prefix would also mean core never answers. | nats.js sets it from `inboxPrefix`, which the code fixes per app (not from the environment). Core refuses any reply not under `_INBOX_bff.<app>.` with literal tokens; NATS lets `bff_<app>` subscribe only there. A unit test captures the reply subject of a real `request()` against an in-process responder; the integration test proves core answers it. | A7, A12 |
| T5 | **Audience mix-up (S, E).** The platform BFF's request lands on the clinical audience or the reverse. | The subject comes from the app constant; `X-MHAI-Audience` is never sent on NATS (core ignores it anyway); separate NATS users can't publish each other's subject. | A8, A12 |
| T6 | **Tokens or bodies in logs (I).** | The transport logs only app, method, status, duration, `X-Request-ID`; errors are logged by class name; no path or query (filters can be sensitive); nats.js debug off. | A9 |
| T7 | **Spoofed core (S).** Something else answers on `api.v1.<app>`. | Only `gateway` (core) may subscribe `api.v1.*` (queue `core`); TLS with `verify` in production. | A12 (permissions) |
| T8 | **Denial of service (D).** NATS down, core's pool full, a slow core. | Fail fast while disconnected; per-call timeout as today; core answers 503 `unavailable` at once when full; no retries in the transport; bodies capped before publish. The readiness signal turns the clinical degraded strip on. | A11, A13 |
| T9 | **Replayed or duplicated writes (T).** A reply lost after core acted. | Clients reuse one `Idempotency-Key` per write; core replays it (72 h). | A14 |
| T10 | **Request ids forged into audit (R).** | The transport never sends `X-Request-ID`/`Mhai-Request-Id`; core drops them anyway and makes its own. | A5 |
| T11 | **Downgrade to plaintext (I).** | Outside `MHAI_DEPLOY_ENV=development` the transport refuses to start without the three TLS files and a `tls://` URL. | A10 |

### Abuse-case tests (carried into the tasks' first steps)

- **A1** A client chunk in `.next/static` with `@nats-io`, `_INBOX_bff`, `nkeyAuthenticator` or `Mhai-Timeout-Ms` fails `check:no-nats`; a test plants each marker and expects the failure. Importing `@mhai/api-client/server/nats/*` from `components/**` is an ESLint error.
- **A2** With `NATS_NKEY_SEED_FILE` pointing at a file that isn't a user seed (`SU...`), the transport refuses to start and logs `config refused (NATS_NKEY_SEED_FILE)` without the file's contents.
- **A3** No log line, error message or thrown error from the transport contains the seed, a token, a password, a body or a query string (a test sends known secrets through every path and scans captured logs).
- **A4** A browser request carrying `X-MHAI-Client-IP`, `Mhai-Path`, `Mhai-Method`, `X-MHAI-Audience`, `traceparent` and `X-MHAI-Service` reaches the fake core with none of them (the proxies' existing "never pass a client header through" tests, run on `nats`).
- **A5** `toNatsRequest` drops every header outside the allow-list, `X-Request-ID` and `Mhai-*` from the caller included, and throws on a value with CR, LF, NUL or a non-ASCII byte, and on a header given twice.
- **A6** With `TRUSTED_CLIENT_IP_HEADER=x-real-ip`, a value that isn't an IP literal is not sent; with the setting unset, no client IP is sent.
- **A7** The reply subject of a real nats.js `request()` starts with `_INBOX_bff.<app>.` and its tokens are literal, for both apps.
- **A8** The clinical transport only ever publishes `api.v1.clinical`, the platform one only `api.v1.platform`, whatever URL or header the caller passes.
- **A9** A failed request logs its status class and request id, never the path.
- **A10** Outside development, a `nats://` URL or a missing TLS file refuses to start; password auth refuses to start.
- **A11** No responders, a timeout, a closed connection, and a reply without (or with two, or a non-numeric) `Mhai-Status-Code` each become 503 `{ "code": "unavailable" }` at the browser.
- **A12** (integration) `bff_clinical` can't publish `api.v1.platform` (permissions violation, then 503 `unavailable`); core answers a correct request; the same request on a hand-built connection with the inbox prefix `_INBOX_bff.platform` as `bff_clinical` gets no answer.
- **A13** (integration) Core stopped: a sign-in answers 503 `unavailable` in under 1 s (no responders), not after the timeout.
- **A14** (unit, both transports) A write's `Idempotency-Key` reaches core unchanged on retry.

### Residual risk and sign-off

- **Accepted:** a stolen seed plus a stolen access token can act as that user until the token expires (15 minutes) and the seed is rotated, the same as a stolen service key plus token on HTTP. NATS accounts aren't split yet on the backend (its TODO.md, "Split NATS accounts before production"); core's reply-prefix check is the defence until then.
- **Accepted:** the demo runs NATS without TLS, on one host, as development (spec §17.6 requires TLS in production; this plan's config refuses to run without it there).
- **Sign-off:** none clinical for the transport (what clinicians see doesn't change). The empty-citations wording and any display of `trust_band` need `clinical-review` (Task 7, Open questions).

## Demo deploy, rollout and rollback

### What changes on the instance

- **Live containers, separate from the public demo.** The public demo (`web`, port 8090) and the platform app (`platform`, port 8091) stay sample data, built with `NEXT_PUBLIC_USE_MOCK=true`, unchanged, and don't join `mhai-bff`: they have no use for it, and a public container without a seed is the safer default. A new image tag (`-live`, built with `USE_MOCK=false`) runs as `web-live` in `/srv/mhai-web/compose.yml` under the profile `live`, on `127.0.0.1:8093` only, reached by SSH tunnel (no nginx site), like core's Redoc. It is the only container that joins `mhai-bff` and holds the seed. The platform gets `platform-live` the same way (`127.0.0.1:8094`, `/srv/mhai-web-platform`) once `bff_platform` exists. (Open question 1 offers the alternative of switching the public demo itself.)
- **`deploy/compose.yml`:**

  ```yaml
  services:
    web-live:
      profiles: ["live"]
      image: ${WEB_LIVE_IMAGE:-ghcr.io/measured-health/mhai-web:live}
      pull_policy: missing
      restart: unless-stopped
      ports: ["127.0.0.1:8093:8080"]
      mem_limit: 384m
      environment:
        BACKEND_TRANSPORT: ${WEB_LIVE_TRANSPORT:-nats}
        MHAI_DEPLOY_ENV: development        # as core on the demo (no NATS TLS on one host)
        NATS_URL: nats://mhai-nats:4222
        NATS_NKEY_SEED_FILE: /run/secrets/nats-bff-clinical.nk
        TRUSTED_CLIENT_IP_HEADER: x-real-ip
        SESSION_SECRET: ${WEB_LIVE_SESSION_SECRET:?set in /srv/mhai-web/.env}
      secrets: [nats-bff-clinical.nk]
      networks: [default, mhai-bff]
      healthcheck:
        test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
        interval: 30s
        timeout: 5s
        start_period: 20s
        retries: 3
  secrets:
    nats-bff-clinical.nk:
      file: /srv/mhai-backend/secrets/bff/nats-bff-clinical.nk   # written by the backend's setup-host.sh (backend follow-up)
  networks:
    mhai-bff:
      external: true
  ```

  The seed file is mode 0400, owned by uid 1001 (the image's `nextjs` user); Compose bind-mounts it read-only at `/run/secrets/`. It is never in `.env`, the environment or the image. `X-Real-IP` reaches the app only from the tunnel's own requests here, so the client IP on the live preview is the tunnel's (acceptable for a team preview; the sign-in counters are per IP and login).
- **`deploy/compose.platform.yml`:** the same `platform-live` block, commented out, with `nats-bff-platform.nk`, until the backend follow-up lands.
- **Dockerfiles:** `ARG USE_MOCK=true` feeds `NEXT_PUBLIC_USE_MOCK`; the default build is unchanged. `HEALTHCHECK` stays on `/` for the mock image; compose overrides it for `-live`.
- **`.github/workflows/deploy.yml`:** a `build-web-live` job (clinical, `USE_MOCK=false`, tag `live` and `live-sha-<commit>`) that runs on `workflow_dispatch` only, and a deploy step that runs `docker compose --profile live up -d web-live` only when `/srv/mhai-web/.env` has `WEB_LIVE_SESSION_SECRET` and the seed file exists, else prints why it skipped (as the platform step does). The public demo's steps don't change and run first.

### Rollout order (keeps the public demo up throughout)

1. **Backend follow-up PR** (below) merged and `setup-host.sh` re-run on the instance: seed files in `/srv/mhai-backend/secrets/bff/`, `bff_platform` in NATS. The demo's NATS restarts once, which core rides out (it reconnects).
2. **This plan's PRs merge with `BACKEND_TRANSPORT` defaulting to `http`.** The public demo and platform redeploy unchanged (sample data; the transport is never called).
3. **HTTP proven first, on steven-reid** (the demo has no HTTP route from a container to core, fact 5): the integration and live e2e suites against the backend smoke stack with `BACKEND_TRANSPORT=http`, then with `nats`, both green (Tasks 8 and 9).
4. **Flip on the instance:** set `WEB_LIVE_SESSION_SECRET`, run the deploy by hand with the live build; `web-live` starts with `nats`. Checks: `/api/health` 200; through the tunnel, sign in, ask a question (it queues, and with no pipeline on the demo fails at its 10-minute deadline, shown as the failed view), sign out; `docker compose logs web-live` shows `nats: connected` and no request content.
5. **Platform:** the same for `platform-live` (sign-in only: no platform data routes exist in core yet).
6. **Later, outside this plan:** production gets NATS TLS; once every live BFF is on `nats`, core sets `CORE_HTTP_API=off` (backend TODO.md) and a mhai-web PR deletes the HTTP transport, `MHAI_API_URL` and `BFF_SERVICE_KEY_FILE`.

### Rollback

- **A live container misbehaves:** `docker compose --profile live stop web-live` (or `platform-live`). Nothing public depends on it.
- **The transport code misbehaves anywhere:** set `BACKEND_TRANSPORT=http` in that service's environment and `up -d` it; the NATS client is then never constructed. On the demo that leaves `web-live` without a route to core (it answers 503), so stopping it is the real rollback there.
- **Bad image:** redeploy the previous tag (`WEB_IMAGE` / `WEB_LIVE_IMAGE=...:sha-<previous>`).
- **Leaked seed:** stop the live containers, run the backend's seed rotation (follow-up PR), restart NATS, start them again.

## Backend follow-up (one small PR in mhai-multiagent, `agent/demo-bff-platform-nkey`)

Needed before step 1 of the rollout; nothing in core's Go code changes.

1. **`deploy/setup-host.sh`:**
   - make the `bff_platform` NKey pair like the clinical one (in a throwaway container with no network, never printed): public key `NATS_BFF_PLATFORM_NKEY` in `.env`;
   - write each BFF seed to a file instead of `.env`: `secrets/bff/nats-bff-clinical.nk` and `secrets/bff/nats-bff-platform.nk`, mode 0400, owned by uid 1001 (mhai-web's container user), folder mode 0750. Move the existing `NATS_BFF_NKEY_SEED` from `.env` into its file (same key pair, so nothing re-keys), then delete it from `.env`;
   - a `--rotate-bff <clinical|platform>` option that makes a new pair, replaces the public key in `.env` and the seed file, and says to restart `nats` and the app.
2. **`deploy/nats/nats.conf`:** a `bff_platform` user, `nkey: $NATS_BFF_PLATFORM_NKEY`, publish `["api.v1.platform"]`, subscribe `["_INBOX_bff.platform.>"]`; update the header comment.
3. **`deploy/compose.yml`:** `NATS_BFF_PLATFORM_NKEY: ${NATS_BFF_PLATFORM_NKEY:?set in /srv/mhai-backend/.env}` in the `nats` service. (Merge only after `setup-host.sh` has run on the instance, or the deploy stops at `:?`.)
4. **`services/core/internal/bus/conf_test.go`:** the demo's `bff_platform` permissions equal `services/nats/nats.conf`'s, as for the clinical user.
5. **`deploy/README.md`** ("The frontend and NATS"): both users, the seed files and their owner, rotation; **`TODO.md`**: drop "no `bff_platform` user", keep "turn core's HTTP API off" pointing at mhai-web's rollout step 6.

(Renaming `NATS_BFF_NKEY` to `NATS_BFF_CLINICAL_NKEY` is optional; see Open questions.)

## Review Focus

- The mapping's two tables (Design) against `natsapi.go` and `headers.go` at `220ed33`: a name or limit that drifts is a bug.
- That no call site changes beyond `fetch` → `backendFetch` and `timeoutMs` (Task 4's diff should read as a substitution).
- The abuse cases A1–A14: each red before its code.
- The deploy: no seed in an image, an env var or `.env`; the public demo's compose and nginx unchanged.

## File structure

```
packages/api-client/
  package.json                              + @nats-io/transport-node, @nats-io/nats-core (exact), server-only
  src/server/backend-fetch.ts (+ .test)     createBackendFetch, backendReady, NATS_API_ORIGIN (the switch)
  src/server/nats/mapping.ts (+ .test)      toNatsRequest, fromNatsReply, NatsRequestSpec (pure)
  src/server/nats/config.ts (+ .test)       readNatsConfig(env, app): validated settings or a refusal
  src/server/nats/connection.ts (+ .test)   the per-process connection, NatsRequester, ready(), drain
  src/server/nats/fake-core.ts              test helper: core's adapter rules in memory, forwards to fetch
  src/server/nats/nats.integration.test.ts  against the backend smoke stack (skipped without MHAI_IT_NATS_URL)
  src/server/upstream.ts (+ .test)          callUpstream passes timeoutMs to its fetchImpl
apps/clinical/
  lib/server/backend.ts (+ .test)           backendFetch for "clinical", clientIp from TRUSTED_CLIENT_IP_HEADER
  lib/server/api.ts (+ .test)               apiBase() per transport; api() uses backendFetch
  app/api/v1/[...path]/route.ts             fetch → backendFetch; readyz on nats from backendReady
  app/api/health/route.ts (+ .test)         readiness for Docker
  instrumentation.ts                        connect at start on nats
  next.config.ts                            serverExternalPackages
  tests/setup.ts                            installs the fake core when BACKEND_TRANSPORT=nats
  lib/api/contract.ts, fixtures.ts, mock.ts trust_band, cited_chunk_ids
  lib/result-view.ts (+ .test), lib/labels.ts, lib/queries.ts (+ .test)
  components/evidence/evidence-panel.tsx (+ .test), components/result/result-card.test.tsx
  playwright.live.config.ts, tests/e2e-live/ask.spec.ts
  Dockerfile                                ARG USE_MOCK
  .env.example
apps/platform/
  lib/server/backend.ts (+ .test), lib/server/http.ts, app/api/v1/[...path]/route.ts,
  app/api/health/route.ts (+ .test), instrumentation.ts, next.config.ts, tests/setup.ts,
  playwright.live.config.ts, tests/e2e-live/sign-in.spec.ts, Dockerfile, .env.example
scripts/
  check-no-nats.mjs (+ .test.mjs)           client chunks hold no NATS marker
  import-boundaries.test.mjs                + the @nats-io rule
  it/backend-stack.sh                       the backend smoke stack for Tasks 8 and 9 (steven-reid)
  it/e2e-live.sh                            the live e2e on both transports
eslint.config.mjs                           no-restricted-imports for @nats-io/* and server/nats
.github/workflows/ci.yml                    unit tests × transport; check:no-nats
.github/workflows/deploy.yml                build-web-live (dispatch only), web-live deploy step
deploy/compose.yml, compose.platform.yml, README.md
docs/adr/0005-bff-talks-to-core-over-nats.md
ARCHITECTURE.md, README.md, TODO.md, CHANGELOG.md
```

Two PRs: **`agent/bff-nats-transport`** (Tasks 1–6, 8, 9, 11) and **`agent/clinical-contract-1-2`** (Task 7), which touches only the clinical contract and screens and can go first or in parallel. Task 10 (deploy) lands on the first PR after the backend follow-up merges, or on its own PR.

## Tasks

### Task 1: The request mapping

**Files:**

- Create: `packages/api-client/src/server/nats/mapping.ts`, `mapping.test.ts`.
- Modify: `packages/api-client/package.json` (`@nats-io/nats-core` exact, `server-only`), `packages/api-client/README.md` (one row).

**Interfaces:**

```ts
import "server-only";
export type BackendApp = "clinical" | "platform";
export const NATS_API_ORIGIN = "http://core.nats.invalid";
export const MAX_BODY = 64 * 1024; // httpx.MaxBody
export const MAX_PATH = 2048; // natsapi.MaxPath
export const STATUS_HEADER = "Mhai-Status-Code"; // natsapi.HeaderStatus
export const REQUEST_HEADERS = ["Authorization", "Content-Type", "Idempotency-Key", "If-None-Match", "X-MHAI-Client-IP", "traceparent"] as const;
export const REPLY_HEADERS = ["Content-Type", "Cache-Control", "ETag", "Retry-After", "X-Request-ID", "Idempotent-Replayed", "Deprecation", "Sunset", "Link", "X-Content-Type-Options"] as const;

export type NatsRequestSpec = {
  subject: `api.v1.${BackendApp}`;
  headers: [name: string, value: string][];
  data: Uint8Array;
  timeoutMs: number;
};
/** A Response for requests answered without core (the local 413 of R6). */
export type Mapped = { kind: "send"; spec: NatsRequestSpec } | { kind: "answer"; response: Response };

export function toNatsRequest(app: BackendApp, url: string, init: { method?: string; headers?: HeadersInit; body?: BodyInit | null; timeoutMs?: number }): Mapped;
export function fromNatsReply(app: BackendApp, method: string, reply: { headers?: { get(k: string): string; values(k: string): string[]; keys(): string[] }; data: Uint8Array }): Response;
```

- [ ] **Step 1: Failing tests first** (`mapping.test.ts`), one `it` each:
  - subject per app; an unknown app throws;
  - method upper-cased; `HEAD`/`PUT` pass; `OPTIONS`, `TRACE`, `get ` with a space throw;
  - `Mhai-Path` is `pathname + search` for `http://core.nats.invalid/api/v1/queries/q1?x=1`; another origin, `/api/v2/`, `/api/v1` without slash, a `#`, a path over 2048 bytes, a non-ASCII byte each throw;
  - A5: only the six headers pass, matched without case and sent in the spelling above; `Accept`, `X-MHAI-Audience`, `X-MHAI-Service`, `X-Request-ID`, `Mhai-Request-Id`, `Mhai-Method`, `mhai-path`, `tracestate`, `baggage`, `Cookie` are dropped; a value with `\r`, `\n`, `\0` or a byte ≥ 0x7f throws; `Authorization` given twice (`Headers.append`) throws;
  - R5: `timeoutMs` 30 000 → `Mhai-Timeout-Ms: 29500`, 15 000 → `14500`, 1200 → `1000`, missing → 15 000 / `14500`;
  - R6: a 64 KB body sends; 64 KB + 1 answers 413 locally with `{ "code": "payload_too_large" }` (`application/problem+json` on clinical; `application/json` and `{code}` only on platform) and builds no spec; a string body is UTF-8 bytes; a `Uint8Array` passes as is; `FormData`/streams throw (no caller sends them on JSON paths; the multipart upload arrives as bytes already);
  - `fromNatsReply`: `Mhai-Status-Code: 201` → status 201; missing, two values, `abc`, `99`, `600` throw; reply headers outside `REPLY_HEADERS` (e.g. `Set-Cookie`, `Mhai-Status`) are dropped; `HEAD`, 204 and 304 have a null body; the body bytes are passed unchanged (a PNG round-trips byte for byte).
- [ ] **Step 2:** run `npm test -w @mhai/api-client` on steven-reid; expect the new tests to fail.
- [ ] **Step 3:** implement. Header values via `Headers` iteration on a copy of `init.headers`; duplicates found with `getSetCookie`-free logic (`Headers` joins duplicates with `, `, so build from the raw `HeadersInit` when it's an array or a record, and treat a `, ` inside `Authorization`, `Idempotency-Key` or `X-MHAI-Client-IP` as a duplicate).
- [ ] **Step 4:** tests pass; `npm run typecheck`; commit `api-client: map a backend request to a NATS message and back`.

### Task 2: The connection

**Files:**

- Create: `packages/api-client/src/server/nats/config.ts`, `config.test.ts`, `connection.ts`, `connection.test.ts`.
- Modify: `packages/api-client/package.json` (`@nats-io/transport-node` exact).

**Interfaces:**

```ts
// config.ts
export type NatsConfig = {
  servers: string;
  auth: { kind: "nkey"; seed: Uint8Array } | { kind: "password"; user: string; pass: string };
  tls: { ca: string; cert: string; key: string } | null;
  inboxPrefix: `_INBOX_bff.${BackendApp}`;
  name: `mhai-web-${BackendApp}`;
};
export function readNatsConfig(app: BackendApp, env: NodeJS.ProcessEnv, readFile: (p: string) => Buffer): NatsConfig | { refused: string /* the setting's name only */ };

// connection.ts
export interface NatsRequester {
  request(subject: string, data: Uint8Array, opts: { headers: [string, string][]; timeoutMs: number; signal?: AbortSignal }): Promise<{ headers?: ...; data: Uint8Array }>;
  ready(): boolean;
}
export function natsRequester(app: BackendApp): NatsRequester; // the per-process singleton
export function __setNatsRequesterForTests(app: BackendApp, r: NatsRequester | null): void;
```

- [ ] **Step 1: Failing tests first:**
  - `config.test.ts`: A2 (a seed file not starting `SU` refuses with `NATS_NKEY_SEED_FILE`, and the refusal text holds no file content); A10 (without `MHAI_DEPLOY_ENV=development`: `nats://` refuses, a missing TLS file refuses, password auth refuses); development accepts `nats://` and `NATS_USER` + `NATS_PASSWORD_FILE`; seed and password both set refuses; neither refuses; `inboxPrefix` comes from the app even if the environment sets `NATS_INBOX_PREFIX`;
  - `connection.test.ts`, with an injected `connect` fake that records options and emits status events: one `connect` per app per process (two calls, one connection; a second app gets its own); options carry `inboxPrefix`, `name`, `maxReconnectAttempts: -1`, `waitOnFirstConnect: true`, the authenticator (never the seed in plain options); `ready()` follows `disconnect` / `reconnecting` / `reconnect` / `close`; a request while not ready rejects at once without calling `request`; a refused config makes every request reject and logs `nats: config refused (<setting>)` once; A3 (captured logs hold no seed, password, token, body or path); SIGTERM calls `drain()` once;
  - A7: start an in-process `nats-server`? No: use nats.js against a **NATS container** only in Task 8. Here, capture the reply subject nats.js generates by giving the fake `connect` a real `@nats-io/nats-core` inbox builder with the same prefix, and assert `^_INBOX_bff\.clinical\.[A-Za-z0-9]+(\.[A-Za-z0-9]+)*$`. The real proof is A12 in Task 8.
- [ ] **Step 2:** tests fail (steven-reid).
- [ ] **Step 3:** implement with `connect` from `@nats-io/transport-node`, `nkeyAuthenticator` / `usernamePasswordAuthenticator` and `headers()` from `@nats-io/nats-core`. Read the installed version's README for the exact option and error names (`inboxPrefix`, the no-responders and timeout errors); map every nats.js error to one thrown `BackendUnavailable` with the original class name only. Keep the singleton on `globalThis[Symbol.for("mhai.nats.<app>")]`.
- [ ] **Step 4:** pass; commit `api-client: the BFF's NATS connection, one per app process`.

### Task 3: The switch

**Files:**

- Create: `packages/api-client/src/server/backend-fetch.ts`, `backend-fetch.test.ts`, `src/server/nats/fake-core.ts`.
- Modify: `packages/api-client/src/server/upstream.ts` and `upstream.test.ts` (pass `timeoutMs` in the init it gives `fetchImpl`, beside the signal; type `fetchImpl` as `BackendFetch`).

**`fake-core.ts`** (test helper, exported for the apps' setup files): a `NatsRequester` that applies core's adapter rules (fact 7) to the spec it receives — subject is `api.v1.<app>`, `Mhai-Method` and `Mhai-Path` exactly once and valid, only the allow-listed headers, body ≤ 64 KB, the reply subject prefix it would have been given — and then calls `globalThis.fetch` (looked up at call time, so `vi.stubGlobal` still works) with `${process.env.MHAI_API_URL ?? "http://api.test"}${Mhai-Path}`, the method, the passed headers plus `X-MHAI-Audience: <app>` (what core derives from the subject), and the body. It turns the `Response` back into a reply with `Mhai-Status-Code` and only the ten reply headers. A rule broken answers like core (405, 404, 413) or, for a wrong reply prefix, never answers (a timeout).

- [ ] **Step 1: Failing tests first** (`backend-fetch.test.ts`):
  - unset or `http`: calls `fetch` with the URL, method, body, the caller's headers, `cache: "no-store"`, plus `X-MHAI-Client-IP` from `clientIp()` and `X-MHAI-Service` from `BFF_SERVICE_KEY_FILE` (A6: neither when absent or invalid; the key never in a log);
  - `nats`: A8 (the subject is the app's, whatever the URL); the URL must start with `NATS_API_ORIGIN` (another origin throws before any request); the client IP rides as `X-MHAI-Client-IP`; `X-MHAI-Service` is never read or sent on `nats`;
  - A11: no responders, timeout, closed, and a bad `Mhai-Status-Code` each reject (the callers' `catch` makes them 503); an `AbortSignal` that fires rejects;
  - `BACKEND_TRANSPORT=grpc` (anything else): every call rejects and one `transport refused` log line;
  - `backendReady`: `http` true; `nats` follows the requester.
- [ ] **Step 2:** fail; **Step 3:** implement; **Step 4:** pass; `upstream.test.ts` still passes unchanged plus one case for `timeoutMs`; commit `api-client: BACKEND_TRANSPORT switch between fetch and NATS`.

### Task 4: Wire both apps

**Files:**

- Create: `apps/clinical/lib/server/backend.ts`, `backend.test.ts`, `apps/clinical/instrumentation.ts`; the same three in `apps/platform`.
- Modify:
  - `apps/clinical/lib/server/api.ts` (+ test): `apiBase()` returns `${NATS_API_ORIGIN}/api/v1` on `nats` (no `MHAI_API_URL` needed), as today on `http`; `api()` passes `fetchImpl: backendFetch`;
  - `apps/clinical/app/api/v1/[...path]/route.ts`: `fetch(url, {...})` → `backendFetch(url, {..., timeoutMs: 30_000})`; on `nats`, `GET readyz` answers `json(backendReady("clinical") ? 200 : 503, {})` before any upstream call (R8; after the session checks, as today);
  - `apps/platform/lib/server/http.ts`: `platformFetch` and `api()` go through `backendFetch` (the `X-MHAI-Audience` header stays for `http` and is dropped by the mapping on `nats`); `apiBase()` as clinical;
  - `apps/platform/app/api/v1/[...path]/route.ts`: `platformFetch(url, {...})` → the same call with `timeoutMs: TIMEOUT_MS`;
  - both `next.config.ts`: `serverExternalPackages: ["@nats-io/transport-node", "@nats-io/nats-core", "@nats-io/nkeys", "@nats-io/nuid"]` (whatever the installed packages are; read `node_modules/next/dist/docs/` on `serverExternalPackages` and output tracing first, per AGENTS.md);
  - both `.env.example`: `BACKEND_TRANSPORT`, `NATS_URL`, `NATS_NKEY_SEED_FILE`, `TRUSTED_CLIENT_IP_HEADER`, `BFF_SERVICE_KEY_FILE`, `MHAI_DEPLOY_ENV`, commented.

**`lib/server/backend.ts`:**

```ts
import "server-only";
import { headers } from "next/headers";
import { isIP } from "node:net";
import { createBackendFetch } from "@mhai/api-client/server/backend-fetch";

async function clientIp(): Promise<string | undefined> {
  const name = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!name) return undefined;
  try {
    const v = (await headers()).get(name)?.trim();
    return v && isIP(v) ? v : undefined;
  } catch {
    return undefined; // outside a request (or a test's next/headers mock without headers)
  }
}
export const backendFetch = createBackendFetch({ app: "clinical", clientIp });
```

- **`instrumentation.ts`:** `export async function register() { if (process.env.NEXT_RUNTIME === "nodejs" && process.env.BACKEND_TRANSPORT === "nats") (await import("@mhai/api-client/server/nats/connection")).natsRequester("clinical"); }` (read Next 16's `instrumentation` guide first).

- [ ] **Step 1: Failing tests first:** `backend.test.ts` (A6 against the `next/headers` mock: `x-real-ip: 198.51.100.7` → sent; `not-an-ip` → not sent; setting unset → not sent); `api.test.ts` (`apiBase()` on `nats` needs no `MHAI_API_URL`); the clinical proxy test gains: on `nats`, `GET readyz` → 200 `{}` when ready and 503 `{}` when not, and never reaches the fake core.
- [ ] **Step 2:** fail; **Step 3:** implement; the diff in both proxies and `http.ts` is the substitution and `timeoutMs` only.
- [ ] **Step 4:** the full suites pass on `http` unchanged; commit `clinical, platform: call core through the backend transport`.

### Task 5: Parity — every BFF suite on both transports

**Files:**

- Modify: `apps/clinical/tests/setup.ts`, `apps/platform/tests/setup.ts`, `packages/api-client/tests/setup.ts`; `apps/*/package.json` and `packages/api-client/package.json` (`"test:nats": "BACKEND_TRANSPORT=nats vitest run app/api lib/server src/server"`); root `package.json` (`"test:nats"` across workspaces); `.github/workflows/ci.yml` (`test` matrix gains `transport: [http, nats]`; the `nats` leg runs `test:nats` for `clinical`, `platform` and `shared`).
- Modify where needed: the few assertions on HTTP-only headers (`Accept` today: eight lines across the proxy and auth suites) become `it.runIf(transport === "http")`, each with a `nats` twin asserting the header is **absent** from the message. `X-MHAI-Audience: platform` assertions stay as they are: the fake core adds it from the subject, as core does.

- [ ] **Step 1:** in each setup file: `if (process.env.BACKEND_TRANSPORT === "nats") { __setNatsRequesterForTests("clinical", fakeCore("clinical")); ... }`, and stub `MHAI_API_URL` as the suites do.
- [ ] **Step 2:** run `npm run test:nats` on steven-reid; list every failure. Each one is either an HTTP-only header assertion (split it as above) or a real difference, which is a bug in Tasks 1–4: fix there, never in the suite.
- [ ] **Step 3:** A4 and A14 hold on `nats` through the existing suites (client headers never forwarded; `Idempotency-Key` passes). Add any missing case to the existing suite so both legs run it.
- [ ] **Step 4:** both legs green in CI; commit `test: run the BFF suites on both transports`.

### Task 6: Keep NATS out of the browser

**Files:**

- Create: `scripts/check-no-nats.mjs`, `scripts/check-no-nats.test.mjs`.
- Modify: `eslint.config.mjs`, `scripts/import-boundaries.test.mjs`, root `package.json` (`check:no-nats`: both apps' `.next/static`), `.github/workflows/ci.yml` (after `check:bundle`).

- [ ] **Step 1: Failing tests first:**
  - `check-no-nats.test.mjs` (A1): a temp folder with a chunk containing each marker (`@nats-io`, `_INBOX_bff`, `nkeyAuthenticator`, `Mhai-Timeout-Ms`, `NATS_NKEY_SEED_FILE`) fails; a clean folder passes; files under `server/` are not scanned (only `static/`);
  - `import-boundaries.test.mjs`: importing `@nats-io/transport-node` from `apps/clinical/components/x.tsx`, `apps/platform/lib/queries/x.ts` or `packages/ui/src/x.ts` is an error; from `packages/api-client/src/server/nats/x.ts` it is not; importing `@mhai/api-client/server/backend-fetch` from `components/**` is an error.
- [ ] **Step 2:** fail; **Step 3:** implement (copy `check-no-platform-code.mjs`'s walker); **Step 4:** on steven-reid, `npm run build && npm run check:no-nats` passes for both apps; also build once with a deliberate `"use client"` import of the transport and confirm `next build` fails on `server-only` (record the message in the PR, then revert); commit `check: no NATS code in client bundles`.

### Task 7: Contract v1.2.0 in the clinical app (PR `agent/clinical-contract-1-2`)

**Files:**

- Modify: `apps/clinical/lib/api/contract.ts`, `fixtures.ts`, `mock.ts`, `mock.test.ts`; `lib/result-view.ts` and its test; `lib/queries.ts` and `queries.test.tsx`; `lib/labels.ts` (`FORBIDDEN_TERMS` + `trust_band`, `cited_chunk_ids`, `method_not_allowed`, `payload_too_large`); `components/evidence/evidence-panel.tsx` and its test; `components/result/result-card.test.tsx`; `components/consultation/consultation-view.test.tsx`.

**Contract changes:**

```ts
export type TrustBand = "low" | "mid" | "high";
export interface ClinicalResultOut {
  // ...unchanged fields...
  /** Provisional banding of a verified answer's trust; null when unverified. Not shown (R12). */
  trust_band: TrustBand | null;
  /** The ids the answer cited. `citations` stays empty until the pipeline stores their details. */
  cited_chunk_ids: string[];
}
export interface QueryCreateIn { /* ... */ client_created_at?: string; }
```

- [ ] **Step 1: Failing tests first:**
  - fixtures and the mock carry `trust_band` and `cited_chunk_ids` for every scenario, including one **"cited, details not stored"** fixture: `citations: []`, `cited_chunk_ids: ["c1", "c2"]`, `decision: "PASS"`;
  - `result-view.test.ts`: that fixture's view keeps its kind and banner rules; confidence still comes from `trust_score` (R12); a needs-review result never shows a confidence level whatever `trust_band` says; `trust_band` appears nowhere in the view model;
  - `evidence-panel.test.tsx`: with `citations: []` and `cited_chunk_ids` non-empty, the sources block reads **"Sources for this answer can't be shown yet."** and the claims line **"Claim details can't be shown yet."** (not "No sources were used", which would be false); with both empty, today's wording stays; no number, id or backend term is shown;
  - `result-card.test.tsx`: no "0 sources" chip; numbered steps without a matching citation show no tag (`parseBody` already drops the marker);
  - `queries.test.tsx` and `consultation-view.test.tsx`, the status mapping: `queued` and `processing` → analysing; `completed` → the result; `failed` with `error_code: "cancelled"`, any other `error_code`, or none → the existing failed view ("Couldn't complete", **Try again**); an unknown `status` value → the failed view (fail closed), never analysing forever;
  - error codes on submit, status and result: 503 `unavailable` is retried as transient (`isTransient`, unchanged) and then shows the failed view; 405 `method_not_allowed` and 413 `payload_too_large` are not retried and show the failed view at once; none of the three codes appears on screen;
  - `FORBIDDEN_TERMS` test covers the four new terms.
- [ ] **Step 2:** fail (steven-reid); **Step 3:** implement; the only new words are the two lines above, marked for `clinical-review`.
- [ ] **Step 4:** the clinical unit suite and the mock e2e pass; commit `clinical: contract v1.2.0 (trust_band, cited_chunk_ids, new codes)`; open the PR with the `clinical-review` label.

### Task 8: Integration against a real NATS and core

**Files:**

- Create: `scripts/it/backend-stack.sh`, `packages/api-client/src/server/nats/nats.integration.test.ts`.
- Modify: `packages/api-client/package.json` (`"test:it": "vitest run src/server/nats/nats.integration.test.ts"`), `packages/api-client/vitest.config.mts` (the integration file is excluded from `test` and needs `MHAI_IT_NATS_URL`).

**`backend-stack.sh`** (runs on steven-reid only): checks out mhai-multiagent at a pinned commit (`MHAI_BACKEND_REF`, default `220ed33`) into `~/claude-work/mhai-it-backend`, generates throwaway secrets as its `.github/scripts/boundary-smoke.sh` does (letters and digits, mode-600 env file, never printed), runs `docker compose -f docker-compose.yml -f docker-compose.smoke.yml -p mhai-it up -d --wait` with the stub pipeline, creates one synthetic hospital and clinician with `core-cli` and activates the hospital as the backend smoke test does, writes the BFF passwords to mode-600 files, prints only the ports and file paths, and with `down` removes the stack and its volumes.

- [ ] **Step 1: write the tests** (they need the stack, so "red first" is: run them against core's HTTP-only build, `CORE_HTTP_API=on` and the `api.v1` subscription off, or before the stack starts, and see them fail):
  - happy path on `nats`, as `bff_clinical`: `POST /api/v1/auth/login` with the synthetic clinician → 200 (or `mfa_required`, then enrol with `@mhai/api-client/totp`) → `POST /queries` with an `Idempotency-Key` → 202 → `GET /queries/{id}` → `queued` or `processing` → with the stub pipeline, `completed` → `GET /queries/{id}/result` has `trust_band` and `cited_chunk_ids`;
  - the same sequence on `http` with `BFF_SERVICE_KEY_FILE`: **status, body and the shared headers equal** the `nats` run (request ids and times aside) — the parity check against the real core;
  - A12: a connection as `bff_clinical` publishing `api.v1.platform` gets a permissions error and the transport answers 503; a hand-built nats.js connection as `bff_clinical` with `inboxPrefix: "_INBOX_bff.platform"` can't subscribe its inbox (permissions) and gets no answer;
  - A13: `docker compose stop core`, then a sign-in → 503 `unavailable` in under 1 s; start it again → the next call succeeds without restarting the BFF (reconnect is NATS's; core rejoins the queue group);
  - 413: a 65 KB body sent with the local check bypassed (a test-only option) → core's 413 `payload_too_large`, mapped through unchanged;
  - `If-None-Match`, `Idempotent-Replayed: true` on a retried `POST /queries` with the same key (A14 against core).
- [ ] **Step 2:** `scripts/it/backend-stack.sh up`, then `MHAI_IT_NATS_URL=... npm run test:it -w @mhai/api-client` through `.remote-run.sh`; all pass; `backend-stack.sh down`.
- [ ] **Step 3:** commit `test: BFF transport against the backend smoke stack, both transports`. Not in GitHub CI (the stack needs the backend's images); the PR description carries the run's summary.

### Task 9: Live e2e on both transports

**Files:**

- Create: `apps/clinical/playwright.live.config.ts`, `apps/clinical/tests/e2e-live/ask.spec.ts`, `apps/platform/playwright.live.config.ts`, `apps/platform/tests/e2e-live/sign-in.spec.ts`, `scripts/it/e2e-live.sh`.
- Modify: both `vitest.config.mts` and `playwright.config.ts` (exclude `tests/e2e-live/**`), both `package.json` (`"e2e:live": "playwright test -c playwright.live.config.ts"`).

- **Config:** the web server builds with `NEXT_PUBLIC_USE_MOCK=false` and starts with `BACKEND_TRANSPORT` from the environment, `MHAI_DEPLOY_ENV=development`, the stack's NATS URL and password file (or `MHAI_API_URL` and the service key file on `http`), `TRUSTED_CLIENT_IP_HEADER=x-real-ip`; Playwright sends `X-Real-IP: 198.51.100.15` (TEST-NET-2) as an extra header. Synthetic data only; `trace: "retain-on-failure"` is fine (no real patient data), and `screenshot: "off"` anyway, since the question has (synthetic) patient details.
- **`ask.spec.ts`:** sign in (enrol two-step if asked), ask a question with synthetic details, see "Analysing", then the result (stub pipeline) with its review banner rule intact, the evidence panel's empty-citations wording if the stub stores none, sign out, and the query cache and storage hold nothing afterwards.
- **`sign-in.spec.ts`** (platform): sign in as a synthetic platform admin, land on the home page, sign out. (No platform data route exists in core; the rest stays on sample data.)
- **`e2e-live.sh`:** stack up, run both specs with `BACKEND_TRANSPORT=http`, then with `nats`, stack down; non-zero if either leg fails.

- [ ] **Step 1:** write the specs; **Step 2:** run `scripts/it/e2e-live.sh` on steven-reid through `.remote-run.sh` with `timeout`; both legs green; **Step 3:** the mock e2e (`npm run e2e`) still passes, unchanged; commit `e2e: live sign-in and question on both transports`.

### Task 10: The demo deploy

Lands after the backend follow-up is merged and `setup-host.sh` has run on the instance.

**Files:**

- Modify: `apps/clinical/Dockerfile`, `apps/platform/Dockerfile` (`ARG USE_MOCK=true` → `ENV NEXT_PUBLIC_USE_MOCK=$USE_MOCK`; nothing else), `deploy/compose.yml` (`web-live`, the `secrets` and `networks` blocks, as in "Demo deploy" above), `deploy/compose.platform.yml` (`platform-live`, commented until the platform flip), `.github/workflows/deploy.yml` (`build-web-live` on `workflow_dispatch`, and the guarded `web-live` step after the demo and platform steps), `deploy/README.md` (a "Live preview over NATS" section: the one-time secret, the tunnel `ssh -N -L 8093:127.0.0.1:8093 ubuntu@<host>`, checks, logs, rollout and rollback, seed rotation).

- [ ] **Step 1:** `docker compose config` with the profile on and off, on steven-reid with a dummy seed file: the public `web` service is byte-for-byte what it was; `web-live` has no seed in `environment`; the secret mounts at `/run/secrets/nats-bff-clinical.nk`.
- [ ] **Step 2:** build the `-live` image on steven-reid (arm64 via buildx) and start it against the smoke stack on a throwaway `mhai-bff`-like internal network: `/api/health` 200, a sign-in works over NATS; `docker inspect` shows no seed; `docker run --rm --entrypoint sh <image> -c 'grep -r SU /app || true'` finds no seed in the image.
- [ ] **Step 3:** commit `deploy: live preview over NATS beside the sample-data demo`; the PR lists the operator steps in order (rollout steps 1, 4, 5).

### Task 11: Docs

**Files:**

- Create: `docs/adr/0005-bff-talks-to-core-over-nats.md` (from `0000-template.md`): context (backend ADR 0011), decision (R1–R12 in short), consequences (the trust boundary moves from an HTTP key to a NATS identity; the seed is a new secret on the host; the HTTP transport is temporary; live preview containers).
- Modify:
  - `ARCHITECTURE.md`: the BFF diagram (`bff -->|NATS api.v1.<app>| core`, HTTP marked "until the switch"), the transport section;
  - `README.md`: the new environment variables;
  - `TODO.md`: the "BFF over NATS" entry becomes the remaining steps (production TLS, the platform flip, deleting the HTTP transport after core turns `CORE_HTTP_API` off); add "letter uploads and file replies over NATS need the documents service" and "show `trust_band` after clinical sign-off";
  - `CHANGELOG.md`; `packages/api-client/README.md` (the new modules).
- [ ] **Step 1:** write; `npm run format:check`; commit `docs: the BFF over NATS`.
- [ ] **Step 2:** run the `security-review` skill on each PR's diff before opening it; fix findings on the branch.

## Where each check runs

| Check | Where |
| --- | --- |
| Unit suites, both transports (Tasks 1–5, 7) | GitHub CI (matrix) and steven-reid |
| `check:no-nats`, `check:bundle`, build | GitHub CI and steven-reid |
| Integration (Task 8), live e2e (Task 9), image checks (Task 10) | steven-reid only (`.remote-run.sh`, wrapped in `timeout`); mt5-lab with its CPU caps if steven-reid is down |
| Mock e2e | GitHub CI, unchanged |

Nothing heavy runs on the laptop.
