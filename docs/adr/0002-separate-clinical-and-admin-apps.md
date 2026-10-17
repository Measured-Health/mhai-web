# 0002. Separate the clinical app and the platform admin app

- **Status:** Proposed
- **Date:** 2026-10-13
- **Deciders:** product owner, frontend lead

## Context

The backend gives platform admins no clinical permissions and clinicians no admin
permissions (mhai-multiagent API spec §5.4). Admin and auditor accounts
need MFA. ADR 0001 expected an admin dashboard inside this app.

Putting both in one app would mean:

- shipping admin code to every clinician's browser;
- sharing one origin, cookie and CSP between the two;
- relying on route guards alone to keep each role out of the other's
  screens.

There are two kinds of admin:

- **Hospital admins** manage one hospital's staff and settings. They are
  often clinicians themselves.
- **Platform admins and auditors** are Measured Health staff who run the
  service.

## Decision

- **Hospital admin tools live in the clinical app,** as a sidebar section
  shown only for the `hospital_admin` role. They're scoped to the user's
  hospital and never show clinical content.
- Build the **platform admin** UI as a **separate Next.js app** in this
  repository. It's deployed on its own origin (`platforms.<domain>`), ideally behind a
  VPN or IP allowlist.
- When admin work starts, convert the repository to npm workspaces:
  `apps/clinical` (today's `app/`), `apps/admin`, and shared
  `packages/ui`, `packages/tokens` and `packages/api-client`. Neither app
  imports from the other.
- Phase 1 changes nothing. The current app is the clinical app.
- Revisited in [ADR 0004](0004-keep-the-hospital-admin-in-the-clinical-app.md) (17 Oct 2026):
  the hospital admin side stays in the clinical app, and the platform admin app's address is
  `platforms.<domain>`.

## Consequences

**Easier:**

- Smaller bundles.
- Clear security boundaries: separate cookies, CSP and network
  exposure.
- Independent releases.
- Each app has a simpler role model.

**Harder:**

- A workspace setup.
- Two deploy targets.
- Shared components have to live in packages.

**Follow-up:**

- the restructure PR;
- admin designs (tables, charts, audit viewer) built on design v3 tokens.

## Alternatives considered

- **One app with an `/admin` route group:** the least setup, but it's a
  weaker boundary and ships admin code to clinicians.
- **A separate repository for admin:** strongest isolation, but it
  duplicates tokens, components and the API client, and they drift apart.
