# Design

**`v3/` is the current design.** Open `v3/index.html` in a browser. Each
board has tabs for its screens, and some have device sizes. The written
spec is `docs/specs/2026-10-13-ui-design-v3.md`: tokens, type, layout,
screen behaviour, wording, accessibility, and the backend gaps the design
depends on.

`brand/` holds the Measured Health logo (original and transparent PNG) and
the "M" mark redrawn as SVG. Replace them with the official SVGs when
they're available.

`mhai-clinical-mockup-v2.html` is the originally approved mockup. v3
restyles it but keeps all of its content. Use it as the checklist of what
the app must contain (the spec, section 9).

`MHAI_Phase1_Cursor_Build_Guide.pdf` is the Phase 1 Build Guide: scope, the
clinician-language rules, the day-by-day build plan and the final acceptance
checklist. It's marked confidential, so keep it inside this private
repository. Where the guide and the repository differ, CONTRIBUTING.md, the
v3 spec and the backend's OpenAPI contract take precedence. Examples are
Next.js instead of Vite, the backend API's actual shape, and v3 instead of
"match the mockup exactly".

These files are kept as approved; Prettier skips this folder. To change
the design, add a new version (`v4/`) through review instead of editing
an existing one.
