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

- **Design v3 is the visual source of truth:** the boards in `design/v3/`
  and the spec `docs/specs/2026-10-13-ui-design-v3.md`. The v2 mockup
  (`design/mhai-clinical-mockup-v2.html`) is the checklist of what the
  app must contain.
- **Show only what the API returns.** Never invent a confidence bar, a
  timing or an ICD-10 code; hide the element when the field is missing.
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
  service-worker caches, **with one exception: the offline outbox**
  (`lib/offline/`). It holds only questions and feedback that couldn't be
  sent yet:
  - encrypted with AES-GCM under a non-extractable device key;
  - bound to the signed-in user (hashed);
  - deleted once synced, when the user deletes it, and on a **manual**
    sign-out (any Sign out button, including Sign out everywhere);
  - purged on next use once older than 72 hours;
  - kept after an idle or expired sign-out (still encrypted and bound to
    the user) until the same user's next sign-in, when it syncs. Other
    users never see it.

  Nothing else (results, history, drafts) is ever stored. The product
  owner gave clinical and privacy sign-off on 16 October 2026. Any change
  to the outbox needs `clinical-review` and a new sign-off. The hashed owner id
  (`sha256("mhai-outbox:" + username)`) is the one accepted exception to
  "nothing about the account in browser storage": it is never the plain
  username, and it only exists while an item waits.

- **Patient alerts show names and MRNs** (Plan 5a). They are held in memory
  only: the query cache, React state and the pop-ups, all cleared on
  sign-out. Never write them to storage, the URL, the document title, logs
  or analytics; don't add print, export or copy for them; and "Ask MHAI
  about it" must never copy the patient's name, MRN or location into a
  consultation. **Clinical and privacy sign-off is required before live
  use** for: names and MRNs in alerts, the bell and pop-ups; alerts kept in
  memory only; Critical alerts always popping up; and alerts present at
  sign-in (or created while the first check fails) not popping up but being
  counted on the bell. It hasn't been given yet, so alerts run on sample
  data only. Any change to how alerts handle patient identifiers needs
  `clinical-review` and that sign-off.
- **Alerts are EMR-agnostic** ([ADR 0003](docs/adr/0003-many-emr-systems.md)):
  no vendor or product names anywhere, the record link comes from the API
  (`emr_link`), and only the hospital's own `source_label` is shown.

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

Branch protection, secret scanning and private vulnerability reporting
need a paid GitHub plan for private repositories, and the organisation is
on the free plan. Until that changes, these rules rely on discipline:

- **Merge only when CI is green and a human has reviewed the PR.** GitHub
  won't block a red or unreviewed merge, so the reviewer has to check.
- **Never force-push `main` or delete it.**
- **Give agents tokens that can push branches and open PRs but can't
  merge** (for example, a separate machine account with write access
  only to feature branches, once rulesets are available). Today agent PRs
  are opened under a maintainer's account.
- **Secrets are caught by the gitleaks step in CI and the pre-commit
  hook,** not by GitHub.

With GitHub Team, turn on:

- branch protection for `main` (require a PR, one approval, review from
  code owners and passing `checks`/`secrets`; block force pushes);
- secret scanning with push protection;
- private vulnerability reporting.
