# 0005. The BFF talks to core over NATS

- **Status:** Accepted
- **Date:** 2026-11-03
- **Deciders:** product owner, frontend lead, backend lead

## Context

Both apps have a server side (the BFF: route handlers and `lib/server/`)
that holds the user's token and calls the core service. Until now it called
core over HTTP with `fetch`. The backend decided (mhai-multiagent ADR 0011,
spec §17 and §18) that the frontends' BFFs reach core over NATS instead:
core serves its whole contract on `api.v1.clinical` and `api.v1.platform`,
and a BFF's NATS identity replaces the `X-MHAI-Service` key. Core's HTTP API
stays on (`CORE_HTTP_API`) until every live BFF has moved. The plan is
`docs/plans/2026-10-31-bff-nats-transport.md`.

On the demo host no container can reach core over HTTP; NATS is reachable
on the internal network `mhai-bff` only.

## Decision

- **One `fetch`-shaped transport per app** (`createBackendFetch` in
  `@mhai/api-client/server/backend-fetch`), switched by
  `BACKEND_TRANSPORT=http|nats` (default `http`; anything else refuses every
  call). Every BFF call site uses it instead of `fetch`; nothing above it
  changes (shapes, sessions, refresh, refusals, file checks).
- **On NATS, one request message per call** on `api.v1.<app>`: `Mhai-Method`,
  `Mhai-Path` (exactly the path the BFF checked: parsed, never normalised,
  no dot segments or encoded slashes), `Mhai-Timeout-Ms` (the caller's
  timeout less 500 ms), and only core's six request headers. The reply's
  status is `Mhai-Status-Code`; only core's ten reply headers are kept.
  Anything unexpected throws, and the callers' existing catch answers 503
  `unavailable`. No retries in the transport. A body over 64 KB is answered
  413 locally, as core would.
- **One NATS connection per app process,** server only (`server-only`, an
  ESLint rule, `check:no-nats` on the built client chunks, nats.js in
  `serverExternalPackages`), as the app's own NKey user (`bff_clinical`,
  `bff_platform`) with the inbox prefix `_INBOX_bff.<app>` fixed in code.
  The seed is a file (`NATS_NKEY_SEED_FILE`), read once. TLS is required
  outside `MHAI_DEPLOY_ENV=development`; password users only in development.
  It connects at server start (`instrumentation.ts`), fails fast while down,
  opens a new connection if NATS closes it, and drains on SIGTERM.
  **Deviation from the plan's R10:** R10 said a call made before the first
  connection is up waits at most its own timeout. As built, every call
  while not connected, including before the first connection, fails at
  once with 503 `unavailable`, the same rule as after a disconnect, so no
  request waits in nats.js's buffer. The cost: in the second or so after a
  start, a request can answer unavailable (the clients retry reads; a write
  keeps its Idempotency-Key).
- **Path and query over 2048 bytes** (core's limit on NATS) are a local
  414 `uri_too_long` on both transports, so a long filter fails the same
  way whichever is on.
- **Live previews** sit behind a loopback proxy that overwrites
  `X-Real-IP` with the connecting address (`deploy/nginx/live-proxy.conf.template`);
  the app containers publish no port of their own.
- **The client IP** (`X-MHAI-Client-IP`, which core needs for sign-in) comes
  only from the header the host's nginx overwrites
  (`TRUSTED_CLIENT_IP_HEADER`), and only as an IP literal, on both
  transports. The HTTP transport also sends `X-MHAI-Service` from
  `BFF_SERVICE_KEY_FILE` while it exists.
- **Readiness:** core doesn't serve probes over NATS, so on NATS the clinical
  `readyz` and each app's `GET /api/health` answer from the app's own
  connection.
- **Parity by construction:** the BFF unit suites run on both transports
  (`test:nats`, an in-memory fake of core's adapter), and the integration
  and live e2e suites run against the backend's smoke stack on both.

## Consequences

- **The trust boundary moves** from an HTTP service key to a NATS identity.
  The NKey seed is a new secret on the host (mode 400, uid 1001, written and
  rotated by the backend's `setup-host.sh`), mounted into the live
  containers only, never in an image, `.env`, the environment or a log. A
  stolen seed alone gives nothing a user token doesn't; NATS permissions
  bound it to one app's subject and inbox.
- **The public demo stays on sample data.** Live mode runs only in the
  loopback-only `web-live` and `platform-live` preview containers (profile
  `live`), reached by SSH tunnel (deploy/README.md).
- **The HTTP transport is temporary.** Once core turns `CORE_HTTP_API` off, a
  later PR deletes it with `MHAI_API_URL` and `BFF_SERVICE_KEY_FILE`.
- **Letter uploads and file replies** can't ride `api.v1` (64 KB request
  body, 1 MB message): on NATS the BFF answers 413 for them until the
  documents service picks a path.
- **Hospital sign-on** redirects the browser to core, which has no
  browser-facing address on NATS: it answers 503 there.
- Production needs NATS TLS with client certificates before any live BFF
  runs outside one host.

## Alternatives considered

- **A new NATS client API for the BFF** instead of a `fetch`-shaped
  function: every call site, test and refusal path would change, and parity
  couldn't be proved by running the same suites twice.
- **Calling NATS from the browser:** it would put a credential and the bus
  in the browser; rejected by the backend's design.
- **Keeping HTTP and exposing core to the frontend containers:** the backend
  wants one ingress (NATS) and its HTTP API off.
