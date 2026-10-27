# @mhai/api-client

Request, retry and two-step helpers shared by the clinical and platform
admin apps. The package is TypeScript source; each app compiles it
(`transpilePackages` in its `next.config.ts`). Import a module by its path:

| Import                                     | What it holds                                                                                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@mhai/api-client/errors`                  | `ApiError` (status and problem `code` only)                                                                                                                                                                    |
| `@mhai/api-client/request`                 | `createApiRequest({ prefix, onUnauthorized })` → `apiRequest`, `apiOk`; `keyHeader`, `RequestOpts`                                                                                                             |
| `@mhai/api-client/network`                 | `useNetwork`, `usePollEvery`, `pollDelay`, `shouldRetry`, `isTransient`, `retryDelay`, `READ_RETRY`                                                                                                            |
| `@mhai/api-client/keyed-mutation`          | `useKeyedMutation` (one Idempotency-Key per write, reused on retries), `WRITE_RETRY`                                                                                                                           |
| `@mhai/api-client/totp`                    | `totp`, `verifyTotp`                                                                                                                                                                                           |
| `@mhai/api-client/codes`                   | `normalizeBackupCode`                                                                                                                                                                                          |
| `@mhai/api-client/password-rules`          | `passwordRules`, `passwordError`, `COMMON_PASSWORDS`                                                                                                                                                           |
| `@mhai/api-client/server/seal`             | Server only. `seal`, `unseal` (AES-256-GCM, key sha256(secret), base64url(iv \| tag \| ciphertext); a secret under 32 characters throws)                                                                       |
| `@mhai/api-client/server/upstream`         | Server only. `callUpstream(base, path, opts)` and `UpstreamError`                                                                                                                                              |
| `@mhai/api-client/server/security-headers` | Server only. `newNonce`, `contentSecurityPolicy(nonce, dev)`, `securityHeaders({ nonce, dev, hsts, referrerPolicy })`, `wantsHsts(nodeEnv, hostname)`: the CSP and security headers both apps' `proxy.ts` send |

Nothing here holds app copy, routes or state: each app passes its own API
prefix, sign-out handler, secret and API address. Packages never import
from an app.

Tests: `npm test -w @mhai/api-client` (Vitest, jsdom).
