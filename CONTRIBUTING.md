# Contributing to mhai-web

The clinician-facing frontend for MHAI (Next.js, TypeScript, Tailwind). The
backend and its API live in
[Measured-Health/mhai-multiagent](https://github.com/Measured-Health/mhai-multiagent).
Shared rules (commit conventions, clinical change control, releases) follow
that repo's CONTRIBUTING.md; this file covers what's specific to the
frontend.

1. Use the Node version in `.nvmrc` (`nvm use`), then `npm ci`
2. Branch off `main` (`feat/<topic>`, `fix/<issue>-<topic>`, `chore/<topic>`;
   agents use `agent/<topic>`)
3. Before pushing: `npm run lint`, `npm run typecheck`,
   `npm run format:check`, `npm run build`
4. Open a PR and fill in the template

## What CI enforces

Every PR must pass:

- `npm ci` with the committed lockfile;
- ESLint;
- Prettier;
- `tsc --noEmit`;
- tests (once added);
- a production build;
- a gitleaks scan of history.

## Conventions

- **Commits:** imperative subject of at most 72 characters ("Add the
  confidence badge"); the body explains _why_. One logical change per
  commit. No AI attribution.
- **Dependencies:** `npm install -E` to pin exact versions; commit
  `package-lock.json`. Dependabot proposes upgrades weekly.
- **Node:** the version in `.nvmrc`; `engines` in `package.json` matches.

## Clinical UI rules

- **The approved mockup is the visual source of truth:**
  `design/mhai-clinical-mockup-v2.html`.
- **Clinicians never see technical terms:** no "trust score", "NLI",
  "semantic entropy", PASS/REGENERATE/ESCALATE or KB ids. Use the
  plain-language mapping from the Phase 1 build guide.
- **Escalated or degraded results** (`decision: escalate` or
  `degraded: true`) always show the review banner and never show a
  confidence level.
- Changes to how results, confidence or citations are shown get the
  `clinical-review` label and sign-off from someone clinical.

## Patient data in the browser

- **Never log patient data** to the console, analytics or error tracking.
- **Never store PHI** in `localStorage`, `sessionStorage`, IndexedDB or
  service-worker caches.
- **Use mock or synthetic data only** in code, tests, Storybook and
  screenshots.

## API contract

- **Types for backend calls are generated from the backend's committed
  `openapi.json`** (once mhai-multiagent #8 lands). Never write them by
  hand.
- **A backend breaking change needs a matching PR here** before it ships.
- **Never send a user or clinician id from the client.** The backend takes
  identity from the session.

## Releases

- Semantic versioning and git tags (`vX.Y.Z`).
- Keep [CHANGELOG.md](CHANGELOG.md) current under _Unreleased_.

## Architecture decisions

Record significant decisions in `docs/adr/` (template:
`docs/adr/0000-template.md`).

## Agent contributions

AI coding agents (Claude Code, Cursor and similar) may implement changes,
but a human decides what reaches `main`. Every agent change follows this
loop:

```
 agent implements ──▶ agent opens PR ──▶ human reviews
        ▲                                     │
        │                         ┌───────────┴───────────┐
        │                      passes                  doesn't pass
        │                         │                        │
        │                 human merges by hand    human requests changes
        │                                          (optional correction notes)
        └──────── agent reads the notes, fixes the same PR ┘
```

### The agent

- Works on its own branch (`agent/<short-topic>` or `fix/<issue>`), never
  on `main`.
- Before opening the PR: runs `npm run lint`, `npm run typecheck`,
  `npm run format:check` and `npm run build`, and adds tests for what it
  changed.
- Opens one PR per task. The description says what changed and why, how
  it was tested (commands and results), what it could not verify, and
  which issues it closes.
- **Never merges, approves or force-merges its own PR,** and never pushes
  to `main`. Merging is always a human action.
- Doesn't add AI attribution to commits or PRs (no co-author trailers or
  "generated with" footers). The human who merges owns the change.
- When changes are requested: reads every review comment and correction
  note, pushes fixes to **the same branch** (no new PR), replies to each
  comment with what it did, or why not, then re-requests review.
- Stops and asks in the PR when a note is ambiguous or would need a
  decision outside the task (clinical thresholds, security trade-offs,
  data handling). It doesn't guess.

### The human reviewer

- Reviews the diff, the tests, and the agent's claims about what was
  verified. Treat unverified claims as unverified.
- **Passes:** approve and merge by hand.
- **Doesn't pass:** choose _Request changes_. Correction notes are
  optional but make the next round faster. Inline comments on the exact
  lines work best, and a short summary in the review body says what must
  change before merge. The agent works only from what's written in the
  PR, so put everything it needs there.
- **Wrong approach entirely:** close the PR with a note explaining why,
  and open or update an issue if the work should be redone.
- Anything that changes how clinical results, confidence or citations
  are shown, or how patient data is handled in the browser, needs a
  reviewer who understands the clinical impact, not just the code.

### Repository settings that back this up

Protect `main`: require a pull request, at least one approving review
from a human, and passing CI before merging, and block force pushes.
Give agents tokens that can push branches and open PRs but can't
approve, merge or change branch protection.
