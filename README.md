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

- **On your machine:** `NEXT_PUBLIC_USE_MOCK=true npm run build && npx next start`
  (the flag is read at build time, so it must be set for the build).
  Feedback is saved to `.feedback/feedback.jsonl` in development.
- **For the team:** https://demo.measured-health.org (open, not listed
  by search engines). Every merge to `main` that passes CI deploys there; see
  [deploy/README.md](deploy/README.md).

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
