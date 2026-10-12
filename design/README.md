# Design

`mhai-clinical-mockup-v2.html` is the approved interactive mockup for the
Phase 1 clinical workflow, and the visual source of truth for the app.
Open it in a browser. Port its colours, fonts (IBM Plex Sans and Mono),
spacing, components and plain-language wording exactly, rather than
redesigning.

`MHAI_Phase1_Cursor_Build_Guide.pdf` is the Phase 1 Build Guide: scope, the
clinician-language rules, the day-by-day build plan and the final acceptance
checklist. It's marked confidential, so keep it inside this private
repository. Where the guide and the repository differ (Next.js instead of
Vite, the backend API's actual shape), CONTRIBUTING.md and the backend's
OpenAPI contract take precedence.

These files are kept exactly as approved; Prettier skips this folder. To
change the design, add a new version (`-v3`) through review instead of
editing an existing one.
