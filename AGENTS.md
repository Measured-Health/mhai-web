<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide: mhai-web

The MHAI frontends: the clinician-facing app and the platform admin app.
Backend and API:
Measured-Health/mhai-multiagent (read its SKILLS.md for the security
model).

## Read first

- [ARCHITECTURE.md](ARCHITECTURE.md): the clinical app, the platform
  admin app, and how both talk to the API.
- [CONTRIBUTING.md](CONTRIBUTING.md): conventions, the clinical UI rules,
  the rules for patient data in the browser, and the agent contribution
  workflow.
- `docs/adr/`: decisions so far.

## Workflow

- Work on your own branch (`agent/<topic>`) and open a PR using the template.
- **Never merge, approve or push to `main`.** A human reviews and merges.
- If changes are requested, fix on the same branch, reply to each comment,
  and re-request review.
- No AI attribution in commits or PRs.

## Commands

The repository is npm workspaces: the clinical app is in `apps/clinical`,
the platform admin app in `apps/platform`, the design tokens in
`packages/tokens`, the shared components in `packages/ui` and the shared
API and sign-in helpers in `packages/api-client`. Neither app imports from
the other. Run these from the root. Paths below are from the root.

```bash
nvm use && npm ci          # Node from .nvmrc, exact lockfile install
npm run dev                # clinical app, http://localhost:3000
npm run dev:platform       # platform admin app, http://localhost:3001
npm run lint               # ESLint
npm run typecheck          # tsc --noEmit
npm run format             # Prettier (format:check in CI)
npm run build              # production build
```

## Rules of thumb

- Follow design v3 (`design/v3/`, spec in `docs/specs/2026-10-13-ui-design-v3.md`), and use the plain-language clinical wording.
  No technical terms in the UI.
- An escalated or degraded result always shows the review banner.
- Never log, store or cache patient data in the browser, except the
  encrypted offline outbox of unsent questions and feedback (`apps/clinical/lib/offline/`,
  see CONTRIBUTING). Use mock or synthetic data only.
- Generate API types from the backend OpenAPI schema; never send user ids
  from the client.
