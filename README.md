# mhai-web

Clinician-facing frontend for **MHAI**, Measured Health's clinical
decision-support system. Built with Next.js (App Router), TypeScript and
Tailwind CSS. The backend lives in
[Measured-Health/mhai-multiagent](https://github.com/Measured-Health/mhai-multiagent).

> Status: the clinical flow (consultation form, analysing view, results,
> evidence panel, feedback) runs on mock data. It is not connected to the
> backend yet.

## Development

```bash
nvm use        # Node version from .nvmrc
npm ci
npm run dev    # http://localhost:3000
```

| Script                            | Purpose                       |
| --------------------------------- | ----------------------------- |
| `npm run lint`                    | ESLint                        |
| `npm run typecheck`               | TypeScript check              |
| `npm run format` / `format:check` | Prettier                      |
| `npm run build` / `start`         | Production build and server   |
| `npm test`                        | Unit tests (Vitest)           |
| `npm run e2e`                     | End-to-end tests (Playwright) |

### Run on mock data

```bash
cp .env.example .env.local   # sets NEXT_PUBLIC_USE_MOCK=true
npm run dev
```

The question text picks the mock result. Words match whole, in any case:
"fever" or "dengue" gives Use with caution, "potassium" gives Needs
review, "fail" (for example "Please fail this request") gives Couldn't
complete, and anything else gives High confidence. "Heart failure" or
"review his medications" get the normal High confidence result. A result
arrives after about 9 seconds.

### Share the demo

The demo runs on sample data (`NEXT_PUBLIC_USE_MOCK=true`). A ribbon on
every screen says so, and its **Give feedback** button opens a short form.
The server appends each message to a file for the team to review (see
[deploy/README.md](deploy/README.md)); it never goes to GitHub. Besides the
message and an optional name or role, it carries only the page path (ids
masked) and the screen size, never anything else typed or shown.

The demo starts at a sign-in page (sample accounts, memory only, so a
reload signs you out). Any email and password works. The page lists sample
accounts you can fill in with one tap: a clinician who signs straight in, a
clinician with two-step (code `123456`, or a real authenticator app using
the secret shown in the demo), a new account (first sign-in), a hospital
admin (the 403 page) and a locked account. The password `wrong` counts
down to a lock, and "Continue with hospital account" signs in through the
demo's hospital sign-on.

- **On your machine:** `NEXT_PUBLIC_USE_MOCK=true npm run build && npx next start`
  (the flag is read at build time, so it must be set for the build).
  Feedback is saved to `.feedback/feedback.jsonl` in development.
- **For the team:** https://demo.measured-health.org (open, not listed
  by search engines). Every merge to `main` that passes CI deploys there; see
  [deploy/README.md](deploy/README.md).

### Live mode

With `NEXT_PUBLIC_USE_MOCK` unset, the app talks to the MHAI API through
its own server routes (`/api/auth/*`, `/api/v1/*`). The API token is
sealed in an `httpOnly` cookie and never reaches browser JavaScript. Set:

- `MHAI_API_URL`: the API base, without `/api/v1`;
- `SESSION_SECRET`: at least 32 characters (`openssl rand -base64 48`);
- `NEXT_PUBLIC_ADMIN_APP_URL` (optional): where the 403 page's "Go to
  admin app" points.

Live mode switches every feature on, including hospital sign-on, password
reset, devices, "trust this device", terms and backup codes. It uses an
assumed backend contract (the plan header and spec section 10 item 14),
so calls to endpoints the API doesn't have yet will fail until it
catches up. Use mock mode until then.

### Weak networks

The app is built for slow and unreliable links. It slows its polling,
pauses while offline, retries safely (writes carry an `Idempotency-Key`),
holds a finished question until the connection returns, switches to data
saver on 2G, and has a slow-3G end-to-end test. The backend's side is in
[spec section 10](docs/specs/2026-10-13-ui-design-v3.md), items 15 to 19.

### Offline

Questions written while offline, and feedback that can't be sent
(offline or on a weak connection), are kept encrypted on the device and
sent when the connection returns. This is the one exception to the
"nothing in browser storage" rule; see [CONTRIBUTING.md](CONTRIBUTING.md)
for the exception and its limits. The product owner gave clinical and
privacy sign-off on 16 October 2026; any change to it needs a new one.

### Tests

```bash
npm test        # unit tests
npm run e2e     # end-to-end, desktop and mobile
```

The e2e suite builds the app in mock mode and serves it on port 3100. The
first time, install the browser with `npx playwright install chromium`.
It checks the four result states, form errors, and that no patient data is
left in browser storage or cookies.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) (including the agent workflow) and
[SECURITY.md](SECURITY.md). Decisions are recorded in `docs/adr/`.
