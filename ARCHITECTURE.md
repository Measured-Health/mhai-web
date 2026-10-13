# Architecture

MHAI has **two frontend apps**. Both talk only to the MHAI API
(`Measured-Health/mhai-multiagent`, base path `/api/v1`).

| App              | Who uses it         | What it does                                                                                               | Status                                                                  |
| ---------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Clinical app** | Clinicians          | Ask clinical questions, read evidence-checked results, give feedback, review other clinicians' corrections | This repo, Phase 1                                                      |
| **Admin app**    | Admins and auditors | Manage users, system health, failed jobs, legal holds, settings, audit log                                 | Planned ([ADR 0002](docs/adr/0002-separate-clinical-and-admin-apps.md)) |

The split follows the backend's security model. An admin account has **no
clinical permissions**: it can't submit queries, see patient data or give
feedback. A clinician has **no admin permissions**. The apps are kept
apart so neither can reach the other's screens, code or session.

## 1. System context

```mermaid
flowchart LR
    clin([Clinician])
    adm([Admin])
    aud([Auditor])

    subgraph web["mhai-web (this repo)"]
        capp["Clinical app<br/>app.&lt;domain&gt;"]
        aapp["Admin app<br/>admin.&lt;domain&gt;<br/>(planned)"]
    end

    idp["Hospital identity provider<br/>(OIDC single sign-on)"]

    subgraph api["mhai-multiagent"]
        gw["MHAI API gateway<br/>/api/v1"]
        wk["Worker<br/>(pipeline jobs)"]
        inf["Inference services<br/>(embedder, NLI, generator, OCR)"]
        db[("Postgres · Redis · object storage")]
    end

    clin --> capp
    adm --> aapp
    aud --> aapp
    capp -- "queries, results, feedback, corrections" --> gw
    aapp -- "users, stats, DLQ, settings, audit" --> gw
    capp -. "sign in" .-> idp
    aapp -. "sign in (MFA asserted)" .-> idp
    gw --> wk --> inf
    gw --> db
    wk --> db
```

The same picture as a sketch:

```text
   Clinician                         Admin / Auditor
       │                                    │
       ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│   CLINICAL APP   │              │    ADMIN APP     │
│ app.<domain>     │              │ admin.<domain>   │
│                  │              │ (VPN / allowlist)│
│ ask · results ·  │              │ users · health · │
│ feedback ·       │              │ DLQ · holds ·    │
│ review queue     │              │ settings · audit │
└────────┬─────────┘              └────────┬─────────┘
         │  clinician token                │  admin/auditor token (MFA)
         └───────────────┬─────────────────┘
                         ▼
               ┌───────────────────┐
               │  MHAI API /api/v1 │  checks role on every route
               └─────────┬─────────┘
                         ▼
          worker · inference services · data stores
```

## 2. Who can do what

This mirrors the API's RBAC matrix (mhai-multiagent spec §5.4). The UI
hides what a role can't do, but **the API is the enforcement point**.

```mermaid
flowchart TB
    subgraph C["Clinical app"]
        c1[Ask a question]
        c2[Read result + evidence]
        c3[Agree / suggest correction]
        c4[Review others' corrections]
        c5[Profile & security]
    end
    subgraph A["Admin app"]
        a1[Users & roles]
        a2[Usage stats]
        a3[Agent status & DLQ]
        a4[Legal holds]
        a5[Settings & retention]
        a6[Audit log + verify]
    end
    clinician((clinician)) --> c1 & c2 & c3 & c4 & c5
    admin((admin · MFA)) --> a1 & a2 & a3 & a4 & a5 & a6
    auditor((auditor · MFA)) --> a6
```

- A **clinician** signing in to the admin app gets a 403 page, and an
  **admin** signing in to the clinical app does too. Each 403 page links
  to the right app.
- **Researcher** has no endpoints yet, so it has no app.

## 3. Repository layout

**Today (Phase 1):** this repo is one Next.js app, and it is the
clinical app.

```text
mhai-web/
├── app/                 Next.js App Router (clinical app)
├── design/              approved designs (v2 mockup, v3 boards, brand assets)
├── docs/adr/            decisions
├── docs/specs/          design specs
└── ARCHITECTURE.md
```

**When admin work starts** (ADR 0002), the repo becomes npm workspaces. The
apps are deployed separately but share packages.

```text
mhai-web/
├── apps/
│   ├── clinical/        today's app/ moves here
│   └── admin/
├── packages/
│   ├── ui/              shared components (buttons, cards, dialogs, tables)
│   ├── tokens/          colours, type, radius, shadows (design v3)
│   └── api-client/      types generated from the backend's openapi.json
└── design/ · docs/
```

```mermaid
flowchart LR
    tokens[packages/tokens] --> ui[packages/ui]
    ui --> clinical[apps/clinical]
    ui --> admin[apps/admin]
    apic[packages/api-client] --> clinical
    apic --> admin
    clinical -. never imports .- admin
```

Neither app imports from the other. Shared code lives only in `packages/`.

## 4. Clinical app

### 4.1 Screen map

The full designs are in `design/v3/`, and the spec is
`docs/specs/2026-10-13-ui-design-v3.md`.

```mermaid
flowchart TD
    login[Sign in] -->|SSO or password| mfa[Two-step code]
    login --> first[First sign-in:<br/>terms → 2-step setup → backup codes]
    first --> home
    mfa --> home[Home / first visit]
    home --> form[New consultation form]
    form -->|Analyse| proc[Analysing]
    proc --> res{Result}
    res -->|PASS| high[High confidence]
    res -->|REGENERATE| caution[Use with caution]
    res -->|ESCALATE or degraded| review[Needs review]
    res -->|failed| failed[Couldn't complete]
    high & caution & review --> fb[Agree / suggest correction]
    high & caution & review --> exp[Copy / print / PDF]
    failed -->|Try again| proc
    home --> rq[Review corrections queue]
    home --> acct[Account menu]
    acct --> prof[Profile & security]
    acct --> mine[My corrections]
    acct --> help[Help & shortcuts]
```

Wireframe of the desktop layout:

```text
┌────────────┬──────────────────────────────────────┬──────────────────┐
│ [M] logo   │ Chest pain, 54 M   URGENT  [▣ panel] │ Evidence & safety│
│ + New      ├──────────────────────────────────────┤                  │
│ ⌕ ⌘K       │  ICD-10 I20.0      ▂▃▅▇ High conf.   │ Safety checks    │
│ ⇄ Review 3 │  Unstable angina                     │  ✓ ✓ ✓           │
│            │  summary…                            │ Why this conf.   │
│ TODAY      │  • step  [✓ AHA 2021]                │  ▬▬▬▬▬▬▬ 92%     │
│ ♥ Chest…   │  • step  [ⓘ needs review]            │ Sources          │
│ ◐ Febrile… │                                      │  ┌────────────┐  │
│            │  [I agree] [Suggest correction] [⧉▾] │  │ AHA 2021 ✓ │  │
│ DR Reyes   │  Completed in 11.8 s                 │  └────────────┘  │
│ ⌂ Hospital │                                      │                  │
└────────────┴──────────────────────────────────────┴──────────────────┘
  256 px              flexible                          330 px
  tablet: 76 px rail · portrait: panel → bottom sheet · mobile: drawer + sheets
```

### 4.2 Inside the app

```mermaid
flowchart LR
    subgraph browser["Browser"]
        ui["Screens & components<br/>(layout, form, processing,<br/>result, evidence, feedback, review)"]
        q["TanStack Query<br/>(in-memory cache only)"]
        mock["Mock adapter<br/>NEXT_PUBLIC_USE_MOCK"]
    end
    subgraph next["Next.js server (same origin)"]
        bff["Route handlers /api/*<br/>hold the session in an httpOnly cookie"]
    end
    ui --> q
    q -->|mock mode| mock
    q -->|live| bff
    bff -->|Bearer token| gw["MHAI API /api/v1"]
```

- **Session:** the Next.js server keeps the API token in an `httpOnly`,
  `Secure`, `SameSite=Strict` cookie and forwards calls to the API. Browser
  JavaScript never sees the token (ADR 0001: "keeping tokens server-side").
- **Types:** generated from the backend's committed `openapi.json`, never
  written by hand.
- **Mock mode:** the same client interface, backed by four example
  results (PASS, REGENERATE, ESCALATE, FAILED). This lets the UI be built
  before the API is live.
- **No patient data in storage:** the query cache is memory-only, and so
  are drafts and session history. Nothing goes in `localStorage`,
  IndexedDB or a service-worker cache. Sign-out and the idle timeout clear
  memory.

### 4.3 Signing in

```mermaid
sequenceDiagram
    actor U as Clinician
    participant W as Clinical app (Next.js server)
    participant A as MHAI API
    participant I as Hospital IdP

    alt Hospital account (SSO)
        U->>W: Continue with hospital account
        W->>A: GET /auth/oidc/login
        A-->>U: redirect to IdP
        U->>I: sign in
        I-->>A: /auth/oidc/callback
        A-->>W: redirect with one-time code (60 s)
        W->>A: POST /auth/oidc/exchange {code}
    else Username and password
        U->>W: username + password
        W->>A: POST /auth/login
        opt MFA required
            A-->>W: {mfa_required, mfa_token}
            U->>W: 6-digit code
            W->>A: POST /auth/mfa/challenge
        end
    end
    A-->>W: access token (15 min)
    W-->>U: httpOnly session cookie
    loop while active
        W->>A: POST /auth/refresh
    end
    Note over U,W: 13 min idle → countdown, 15 min → sign out
```

### 4.4 Asking a question

```mermaid
sequenceDiagram
    actor U as Clinician
    participant W as Clinical app
    participant A as MHAI API
    participant K as Worker

    U->>W: Analyse (form valid)
    W->>A: POST /queries
    A-->>W: 202 {query_id, queued}
    A->>K: job
    loop every ~2 s until completed or failed
        W->>A: GET /queries/{id}
        A-->>W: {status, progress, current_stage}
        W-->>U: step list + progress bar
    end
    W->>A: GET /queries/{id}/result
    A-->>W: ClinicalResultOut
    W-->>U: result state (see 4.5)
```

### 4.5 Which result state to show

```mermaid
flowchart TD
    r[ClinicalResultOut] --> d{degraded?}
    d -->|yes| NR["Needs review<br/>red banner · no confidence"]
    d -->|no| dec{decision}
    dec -->|ESCALATE| NR
    dec -->|REGENERATE| UC["Use with caution<br/>amber pill + banner"]
    dec -->|PASS| HC["High confidence<br/>green pill"]
    s[status = failed] --> F["Couldn't complete<br/>Try again"]
    r --> n{l3_nli.model_loaded?}
    n -->|false| RA["+ reduced-accuracy notice"]
```

Citation tags follow `Citation.action`: PASS shows a green "verified" tag,
FLAG an amber "needs review" tag, and REDACT a red "removed" tag with the
text struck through.

### 4.6 Corrections need two clinicians

```mermaid
sequenceDiagram
    actor A as Clinician A
    actor B as Clinician B
    participant W as Clinical app
    participant API as MHAI API

    A->>W: Suggest correction (what + why)
    W->>API: POST /feedback {action: correct}
    API-->>W: {pending_review, correction_id}
    B->>W: Review corrections
    W->>API: GET /corrections?status=pending
    Note over W,API: A's own corrections are never listed for A
    B->>W: Approve
    W->>API: POST /corrections/{id}/approve
    API-->>W: approved → clinical sign-off before KB change
    Note over A,W: A sees the outcome in My corrections
```

Rejecting with a reason, withdrawing, and the "My corrections" list need
new endpoints. They're listed in the design spec §10.

## 5. Admin app (planned)

**Scope** comes from the backend's admin endpoints (API spec §4.1, §11).
Every admin action is audited.

| Area                              | Endpoints                                         | Who            |
| --------------------------------- | ------------------------------------------------- | -------------- |
| Users and roles                   | `GET/POST/PATCH /admin/users`                     | admin          |
| Usage stats                       | `GET /hga/stats`                                  | admin          |
| Agent status and queues           | `GET /agents/status`, `/admin/dlq`, retry, cancel | admin          |
| Feedback buffer reset             | `POST /admin/feedback-buffer/reset`               | admin          |
| Legal holds                       | `PUT/DELETE /admin/legal-holds`                   | admin          |
| Settings (retention, triage gate) | `GET/PATCH /admin/settings`                       | admin          |
| Audit log and integrity check     | `GET /security/audit`, `/security/audit/verify`   | auditor, admin |

```text
┌────────────┬─────────────────────────────────────────────────────┐
│ [M] Admin  │ System health                          ● All good   │
│            ├─────────────────────────────────────────────────────┤
│ ◉ Health   │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│ ☺ Users    │ │ Queue 3 │ │ DLQ 0   │ │ p95 14s │ │ Workers │     │
│ ▤ Stats    │ └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│ ⚑ Holds    │ Decision mix (PASS / REGENERATE / ESCALATE) ▇▅▂     │
│ ⚙ Settings │ Recent failed jobs …                    [Retry]     │
│ ⛨ Audit    │                                                     │
│ AD admin   │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

**Rules:**

- MFA is required for admin and auditor. A single sign-on login must
  carry the IdP's MFA assertion.
- Served from its own origin (`admin.<domain>`), ideally reachable only
  over VPN or an IP allowlist. Its cookie is scoped to that origin, and
  it has its own CSP.
- **It never shows patient data.** Admin endpoints return ids and counts
  only.
- It uses the same design tokens and components as the clinical app.
  Its layout is denser, and it uses tables and charts.

## 6. Deployment

```mermaid
flowchart LR
    u1([Clinicians]) --> cdn1["app.&lt;domain&gt;<br/>Clinical app"]
    u2([Admins, auditors]) -->|VPN / allowlist| cdn2["admin.&lt;domain&gt;<br/>Admin app"]
    cdn1 --> api["api.&lt;domain&gt;/api/v1"]
    cdn2 --> api
```

Each app is its own Next.js build and container, so they can be released
and rolled back on their own.

## 7. Cross-cutting rules

These are in CONTRIBUTING.md and apply to both apps:

- plain-language wording, never backend terms;
- an escalated or degraded result always shows the review banner;
- no patient data in logs, storage or analytics;
- API types are generated, never handwritten;
- the client never sends user ids;
- confidence is never shown by colour alone;
- keyboard and screen-reader support;
- `prefers-reduced-motion` is respected.
