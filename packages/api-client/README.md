# @mhai/api-client

Request, retry and two-step helpers shared by the clinical and platform
admin apps. The package is TypeScript source; each app compiles it
(`transpilePackages` in its `next.config.ts`). Import a module by its path:

| Import                                     | What it holds                                                                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mhai/api-client/errors`                  | `ApiError` (status and problem `code` only)                                                                                                                                                                     |
| `@mhai/api-client/request`                 | `createApiRequest({ prefix, onUnauthorized })` → `apiRequest`, `apiOk`; `keyHeader`, `RequestOpts`                                                                                                              |
| `@mhai/api-client/network`                 | `useNetwork`, `usePollEvery`, `pollDelay`, `shouldRetry`, `isTransient`, `retryDelay`, `READ_RETRY`                                                                                                             |
| `@mhai/api-client/keyed-mutation`          | `useKeyedMutation` (one Idempotency-Key per write, reused on retries), `WRITE_RETRY`                                                                                                                            |
| `@mhai/api-client/totp`                    | `totp`, `verifyTotp`                                                                                                                                                                                            |
| `@mhai/api-client/codes`                   | `normalizeBackupCode`                                                                                                                                                                                           |
| `@mhai/api-client/password-rules`          | `passwordRules`, `passwordError`, `COMMON_PASSWORDS`                                                                                                                                                            |
| `@mhai/api-client/server/seal`             | Server only. `seal`, `unseal` (AES-256-GCM, key sha256(secret), base64url(iv \| tag \| ciphertext); a secret under 32 characters throws)                                                                        |
| `@mhai/api-client/server/upstream`         | Server only. `callUpstream(base, path, opts)` and `UpstreamError`                                                                                                                                               |
| `@mhai/api-client/server/backend-fetch`    | Server only. `createBackendFetch({ app, clientIp })`: the BFF's `fetch`-shaped way to core, switched by `BACKEND_TRANSPORT=http\|nats` (ADR 0005); `backendReady(app)`, `backendTransport()`, `NATS_API_ORIGIN` |
| `@mhai/api-client/server/nats/connection`  | Server only. `natsRequester(app)`: one NATS connection per app process (NKey seed file, inbox `_INBOX_bff.<app>`, fail fast while down, drain on SIGTERM); `BackendUnavailable`; `__setNatsRequesterForTests`   |
| `@mhai/api-client/server/nats/config`      | Server only. `readNatsConfig(app, env, readFile)`: the NATS settings, or a refusal naming the setting only                                                                                                      |
| `@mhai/api-client/server/nats/fake-core`   | Tests only. `fakeCore(app)`: core's NATS adapter in memory, in front of a stubbed `fetch` (`npm run test:nats`)                                                                                                 |
| `@mhai/api-client/server/log`              | Server only. `formatLog(event, fields)`: one JSON line with fixed fields, never a token, body or path                                                                                                           |
| `@mhai/api-client/server/nats/mapping`     | Server only. `toNatsRequest`, `fromNatsReply`: one backend request as one NATS message on `api.v1.<app>` and core's reply back as a `Response` (core's `natsapi` rules)                                         |
| `@mhai/api-client/server/security-headers` | Server only. `newNonce`, `contentSecurityPolicy(nonce, dev)`, `securityHeaders({ nonce, dev, hsts, referrerPolicy })`, `wantsHsts(nodeEnv, hostname)`: the CSP and security headers both apps' `proxy.ts` send  |

Nothing here holds app copy, routes or state: each app passes its own API
prefix, sign-out handler, secret and API address. Packages never import
from an app.

Tests: `npm test -w @mhai/api-client` (Vitest, jsdom); `npm run test:nats
-w @mhai/api-client` runs the server modules with `BACKEND_TRANSPORT=nats`;
`npm run test:it -w @mhai/api-client` runs the NATS integration test against
the backend's smoke stack (`scripts/it/`, build server only).
