# 0004. Keep the hospital admin side in the clinical app

- **Status:** Accepted
- **Date:** 2026-10-17
- **Deciders:** product owner, frontend lead

## Context

ADR 0002 put the hospital admin tools in the clinical app and the platform admin tools in a
separate app. Plan 4 built the hospital admin side (staff, invites, settings, usage,
activity, review oversight). We asked again whether the hospital admin side should also be
its own app.

What a separate app would add:

- its own origin, cookie and Content Security Policy;
- network restriction (for example only from a hospital's own network or VPN);
- its own release cycle.

What it would cost:

- People who are both clinician and hospital admin (medical directors, senior clinicians)
  would sign in twice, with two sessions and two two-step prompts.
- A second deploy target and a shared-packages setup earlier than needed.

What already protects the hospital admin side in one app:

- The BFF forwards `/hospital/*` only for a session that holds `hospital_admin` **and** has
  two-step turned on, and only exact method and path shapes; refusals never reach the API.
- Admin-only accounts never reach clinical routes, data or providers; clinicians without
  `hospital_admin` never reach admin routes.
- Two-step is required for every hospital admin; removing staff needs the admin's current
  code; every admin action is audited.
- Next.js splits code by route, so admin screens are only downloaded when `/admin` is
  opened.
- The blast radius is one hospital, with no clinical content (unlike the platform admin,
  which spans every hospital).

## Decision

- **Keep the hospital admin side in the clinical app**, under `app/(clinical)/admin/` with
  its own layout and gate (`AuthGate need="admin"` and the two-step requirement).
- Keep that route group self-contained (no imports from it into clinical screens), so it can
  move to its own origin later without a rewrite.
- **Platform admin stays a separate app** (ADR 0002), served from `platforms.<domain>`
  rather than `admin.<domain>`, which is too easy to guess. The address is not the
  protection: VPN or IP allowlist, two-step and no links from the clinical app are.

## Revisit when

Reopen this decision if any of these happens:

- a hospital requires the admin pages to be reachable only from its own network or VPN;
- the admin side needs a stricter security policy than the clinical app can share;
- the admin side grows enough to need its own release cycle;
- a security review finds the shared origin a material risk.

If it does, move `app/(clinical)/admin/` to its own origin (for example
`hospital.<domain>`) using the workspace layout ADR 0002 describes.

## Consequences

- One sign-in for people who hold both roles.
- The hospital admin side shares the clinical app's origin, cookie and policy; its
  protection relies on the BFF gate, role routing and two-step, which are tested.
- The admin route group must stay self-contained (a rule for reviewers).
