# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Clinical flow on mock data (Plan 1, design v3): consultation form,
  analysing view, the four result states, evidence panel and mobile sheet,
  feedback and corrections, export and print, first visit, failure,
  offline, idle timeout and unsaved-draft states, search (Ctrl/Cmd+K),
  keyboard shortcuts, help, and motion with reduced-motion support.
- End-to-end tests (Playwright, desktop and Pixel 7) and a CI step that runs
  them in mock mode.
- Design v3 (`design/v3/`): brand-forward clinical UI for desktop, tablet
  and mobile; account, review-queue, state and export screens; brand
  assets in `design/brand/`; spec in `docs/specs/`.
- `ARCHITECTURE.md`: the clinical app, the planned admin app, and their
  flows, with diagrams.
- ADR 0002: separate the clinical and admin apps (proposed).

- Next.js app scaffold (TypeScript, App Router, Tailwind, ESLint).
- Development standards:
  - CI (lint, format, type-check, build, secret scan);
  - Prettier, Node version pin, Dependabot, CODEOWNERS;
  - PR and issue templates, `SECURITY.md`, `CONTRIBUTING.md`, ADRs and an
    agent guide.

### Fixed

- Missing pages say what was missing: an unknown address reads "This page
  doesn't exist", and an unknown or ended consultation keeps its own message.
  The printout uses the same not-found page instead of a bare line.
- Opening a consultation or printout link directly now returns a real 404
  status, not 200.
