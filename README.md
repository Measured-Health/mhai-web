# mhai-web

Clinician-facing frontend for **MHAI**, Measured Health's clinical
decision-support system. Built with Next.js (App Router), TypeScript and
Tailwind CSS. The backend lives in
[Measured-Health/mhai-multiagent](https://github.com/Measured-Health/mhai-multiagent).

> Status: scaffold only. The Phase 1 clinical workflow (assessment form,
> processing view, result, evidence panel, feedback) is not built yet.

## Development

```bash
nvm use        # Node version from .nvmrc
npm ci
npm run dev    # http://localhost:3000
```

| Script                            | Purpose                     |
| --------------------------------- | --------------------------- |
| `npm run lint`                    | ESLint                      |
| `npm run typecheck`               | TypeScript check            |
| `npm run format` / `format:check` | Prettier                    |
| `npm run build` / `start`         | Production build and server |

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) (including the agent workflow) and
[SECURITY.md](SECURITY.md). Decisions are recorded in `docs/adr/`.
