# Plan 1: Clinical flow on mock data (design v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the clinician's full Phase 1 flow in design v3 (form →
analysing → four result states → evidence → feedback → export), plus its
states and utilities, running on mock data at every screen size.

**Architecture:** One Next.js App Router app. UI components read data
only through a typed `MhaiClient` interface. Plan 1 ships the mock
implementation (`NEXT_PUBLIC_USE_MOCK=true`), so no backend is needed.
TanStack Query holds server state **in memory only**. One pure function,
`toResultView`, turns an API result into what the screen shows, and every
safety rule is tested there.

**Tech Stack:**

- Next.js 16.4 (App Router), React 19.3, TypeScript 5, Tailwind v4
- `next/font`: Darker Grotesque, Outfit, JetBrains Mono
- TanStack Query 5, Zod 4, lucide-react, clsx
- Vitest, React Testing Library, jsdom, @testing-library/user-event
- Playwright for the end-to-end acceptance run

**Spec:** `docs/specs/2026-10-13-ui-design-v3.md` (the design boards are
in `design/v3/`; the system context is in `ARCHITECTURE.md`).

**Not in this plan:**

- **Plan 2:** sign-in, accounts, the 403 "wrong app" page, the BFF
  session, the live API adapter and types generated from OpenAPI.
- **Plan 3:** the corrections review queue and My corrections.
- **Plan 4:** the hospital admin side.

**Mock first, everywhere.** Plans 2–4 also start with mock versions behind
the same `MhaiClient` pattern. That way the whole app can be clicked through
and reviewed by the team before the backend is ready. Each plan then swaps
in the live adapter once its API lands (spec §10). Plan 1 shows a fixed
demo user ("Dr. Reyes · Havana Hospital") in the sidebar footer.

## Global Constraints

- **Read the Next.js docs before coding:** this Next.js version has
  breaking changes. Before writing code for a feature, read the matching
  guide in `node_modules/next/dist/docs/` (AGENTS.md).
- **Node and installs:** Node 24 (`.nvmrc`). Install with `npm install -E`
  to pin exact versions, and commit `package-lock.json`.
- **Wording:** clinicians never see "trust score", "NLI", "entropy",
  "PASS", "REGENERATE", "ESCALATE", "KB" or "guardrail". The labels are
  "High confidence", "Use with caution", "Needs review" and "Couldn't
  complete".
- **Escalated or degraded results:** `decision === "ESCALATE"` or
  `degraded === true` always show the review banner and **never** show a
  confidence level.
- **Show only what the data has:** never invent a confidence bar, a
  timing or an ICD-10 code. Hide the element when the field is `null` or
  missing.
- **No patient data in the browser:**
  - none in `console.*`, `localStorage`, `sessionStorage`, IndexedDB,
    cookies or a service worker;
  - session history and drafts are kept in memory only;
  - use synthetic data only.
- **Never send a user or clinician id from the client.**
- **Confidence never relies on colour alone:** always a word plus a bar
  count.
- **Motion:** use the tokens `--t-instant` (100 ms), `--t-fast` (160),
  `--t-base` (240), `--t-slow` (400) and `--t-story` (700), and the easings
  `--e-out` `cubic-bezier(.2,.7,.2,1)`, `--e-in-out`
  `cubic-bezier(.65,0,.35,1)` and `--e-spring`
  `cubic-bezier(.34,1.56,.64,1)`. All motion is off under
  `prefers-reduced-motion: reduce`. Never animate diagnosis text, doses
  or numbers in results.
- **Form limits:** age 0–120; sex `female|male|other|unknown`; 1–20
  symptoms of ≤200 characters each; clinical question 10–2000
  characters; medical history ≤2000; urgency `routine|urgent|emergency`.
  A correction needs `corrected_diagnosis` 3–500 characters and `reason`
  3–1000.
- **Accessibility:** touch targets ≥44 px on mobile. Dialogs trap focus
  and close on Esc. Every control is reachable by keyboard.
- **Commits:** imperative subject ≤72 characters, and **no AI
  attribution**. Work on branch `agent/plan-1-clinical-flow`; humans
  merge.

## Review Focus

1. **A degraded PASS result** (`decision: "PASS", degraded: true`) must
   render as Needs review, with no pill. Tested in Task 2.
2. **A result with `trust_score: null`, `icd10_code: null`, no citations
   or an empty `response_text`** must render without crashing or showing
   empty chrome. Tested in Tasks 2 and 9.
3. **Pasting a long or messy clinical question** must keep the text and
   show the count. A question over 2000 characters blocks submit with a
   clear message, and is never trimmed silently. Tested in Task 4.
4. **Polling a query that ends `failed`, or a stalled query** (no
   progress for 120 s) must stop polling and show Couldn't complete with
   the inputs kept. Tested in Tasks 6 and 11.
5. **Leaving the app or the page mid-draft** must not write anything to
   storage, and must ask before discarding. Tested in Tasks 6 and 11.

---

## File structure

```text
app/
  layout.tsx                    fonts, metadata, <Providers>
  globals.css                   design tokens (@theme), base styles, motion
  providers.tsx                 QueryClientProvider, SessionProvider, ClientProvider
  (clinical)/layout.tsx         AppShell (sidebar, top bar, panel slot)
  (clinical)/page.tsx           home: first visit, or the new consultation form
  (clinical)/c/[id]/page.tsx    one consultation: analysing → result
  (clinical)/help/page.tsx      help & guide (BHAI card)
  print/[id]/page.tsx           print layout (no shell)
  not-found.tsx                 404
lib/
  api/contract.ts               request/response types (mirrors backend spec §4.2)
  api/client.ts                 MhaiClient interface + getClient()
  api/mock.ts                   mock client (timers, 4 fixtures)
  api/fixtures.ts               PASS / REGENERATE / ESCALATE / FAILED examples
  result-view.ts                toResultView(): API result → what the UI shows
  labels.ts                     plain-language labels, stage names, forbidden terms
  form-schema.ts                Zod schemas for the form and correction
  session-store.tsx             in-memory session history (React context)
  queries.ts                    TanStack hooks: submit, poll status, fetch result, feedback
  hooks/use-idle.ts             idle timer for the session-timeout dialog
  hooks/use-shortcuts.ts        global keyboard shortcuts
  hooks/use-online.ts           online/offline status
components/
  ui/                           Button, Card, Chip, ConfidencePill, Banner, Dialog, Sheet, Skeleton, Toast
  shell/                        AppShell, Sidebar, TopBar, EvidenceDock, MobileDrawer
  form/                         ConsultationForm, SegmentedControl, PriorityPicker, SymptomInput, ErrorSummary
  processing/                   ProcessingView, StageList, EcgLine
  result/                       ResultView, ResultCard, CitationTag, ResultBanner
  evidence/                     EvidencePanel, SafetyChecks, ConfidenceBars, SourceCards
  states/                       FailedView, FirstVisit, OfflineStrip, DegradedStrip, SessionTimeout, UnsavedGuard, DemoRibbon
  utility/                      CommandPalette, ShortcutsDialog
  consultation/                 ConsultationView (analysing → result → failed)
  print/                        PrintSheet
  feedback/                     FeedbackBar, CorrectionForm, ExportMenu, resultAsText
tests/
  setup.ts                      RTL + jest-dom setup
  e2e/clinical-flow.spec.ts     Playwright acceptance (mock mode)
public/brand/                   logo PNG, mark SVG, BHAI placeholder (copied from design/brand)
```

Tests sit next to their code as `*.test.ts(x)`, except the e2e tests in
`tests/e2e/`.

---

### Task 1: Tooling, design tokens, fonts and brand assets

**Files:**

- Modify: `package.json`, `app/layout.tsx`, `app/globals.css`
- Create: `vitest.config.mts`, `tests/setup.ts`, `components/ui/brand.tsx`, `components/ui/brand.test.tsx`, `public/brand/*`
- Delete: `app/page.tsx` (it moves to `app/(clinical)/page.tsx` in Task 7), `public/{file,globe,next,vercel,window}.svg`

**Interfaces:**

- Produces: CSS variables and Tailwind colours `bloom, bloom-2, orchid, lilac, lilac-2, mint, mint-2, mint-deep, mint-wash, ink, ink-2, ink-3, line, bg, ok, ok-wash, ok-deep, warn, warn-wash, warn-deep, warn-line, bad, bad-wash, bad-deep, bad-line`; font utilities `font-display`, `font-sans`, `font-mono`; the motion variables; `<Logo />`, `<Mark />`, `<PartnerLine />`.

- [ ] **Step 1: Read the docs, then install the dependencies**

Read `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` and the font docs (`01-app/01-getting-started/*fonts*`).

```bash
git checkout -b agent/plan-1-clinical-flow origin/main
npm install -E @tanstack/react-query zod lucide-react clsx
npm install -E -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom vite-tsconfig-paths @playwright/test
mkdir -p public/brand && cp design/brand/measured-health-logo-transparent.png public/brand/logo.png && cp design/brand/measured-health-mark.svg public/brand/mark.svg && cp design/brand/bhai-logo-placeholder.svg public/brand/bhai.svg
git rm -q public/file.svg public/globe.svg public/next.svg public/vercel.svg public/window.svg
```

Add these scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test"
```

- [ ] **Step 2: Configure Vitest**

`vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "tests/e2e/**", ".next"],
  },
});
```

`tests/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());
```

- [ ] **Step 3: Write the failing test**

`components/ui/brand.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo, Mark, PartnerLine } from "./brand";

describe("brand", () => {
  it("renders the logo with an accessible name", () => {
    render(<Logo />);
    expect(
      screen.getByRole("img", { name: "Measured Health" }),
    ).toBeInTheDocument();
  });
  it("renders the M mark with an accessible name", () => {
    render(<Mark />);
    expect(
      screen.getByRole("img", { name: "Measured Health" }),
    ).toBeInTheDocument();
  });
  it("credits the BHAI partnership", () => {
    render(<PartnerLine />);
    expect(screen.getByText(/In partnership with/)).toBeInTheDocument();
    expect(screen.getByText("BHAI")).toBeInTheDocument();
    expect(screen.getByText(/University of Chicago/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `npx vitest run components/ui/brand.test.tsx`
Expected: FAIL, because `./brand` can't be resolved.

- [ ] **Step 5: Implement the tokens, fonts and brand components**

`app/globals.css` (replace the whole file):

```css
@import "tailwindcss";

@theme {
  --color-bloom: #460351;
  --color-bloom-2: #2c0136;
  --color-orchid: #a8499e;
  --color-lilac: #f1ecf4;
  --color-lilac-2: #e8dfee;
  --color-mint: #15999e;
  --color-mint-2: #43c1c5;
  --color-mint-deep: #15777c;
  --color-mint-wash: #e3f4f4;
  --color-ink: #1c0d22;
  --color-ink-2: #4a3d50;
  --color-ink-3: #8a7f90;
  --color-line: #ece4ef;
  --color-bg: #f6f2f8;
  --color-ok: #1b7a4a;
  --color-ok-wash: #e4f5ec;
  --color-ok-deep: #135a36;
  --color-warn: #b5742a;
  --color-warn-wash: #fbf0e2;
  --color-warn-deep: #8c5a1f;
  --color-warn-line: #ecca8e;
  --color-bad: #a04438;
  --color-bad-wash: #f8e8e5;
  --color-bad-deep: #7d3029;
  --color-bad-line: #e0b5ae;
  --font-display: var(--font-darker), sans-serif;
  --font-sans: var(--font-outfit), system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
  --radius-card: 22px;
  --shadow-card: 0 24px 50px -28px rgb(70 3 81 / 0.4);
}

:root {
  --t-instant: 100ms;
  --t-fast: 160ms;
  --t-base: 240ms;
  --t-slow: 400ms;
  --t-story: 700ms;
  --e-out: cubic-bezier(0.2, 0.7, 0.2, 1);
  --e-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --e-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}

html,
body {
  height: 100%;
}
body {
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
}
.tabular {
  font-variant-numeric: tabular-nums;
}

/* Frosted card with a gradient hairline border (design v3 §3). */
.card-v3 {
  position: relative;
  border-radius: var(--radius-card);
  background: rgb(255 255 255 / 0.84);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-card);
}
.card-v3::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(
    135deg,
    var(--color-mint),
    #46035133,
    transparent 60%
  );
  -webkit-mask:
    linear-gradient(#000 0 0) content-box,
    linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* Faint grid + glows behind the main column. */
.canvas-v3 {
  background:
    radial-gradient(700px 360px at 85% -10%, #15999e22, transparent 60%),
    radial-gradient(600px 360px at -10% 110%, #4603511a, transparent 60%),
    var(--color-bg);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
```

`app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Darker_Grotesque, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

const darker = Darker_Grotesque({
  variable: "--font-darker",
  subsets: ["latin"],
  weight: ["700", "800", "900"],
});
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MHAI · Measured Health",
  description: "Evidence-checked clinical decision support",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${darker.variable} ${outfit.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
```

`components/ui/brand.tsx`:

```tsx
/* eslint-disable @next/next/no-img-element -- small static brand assets */
export function Logo({ className = "h-11 w-auto" }: { className?: string }) {
  return (
    <img src="/brand/logo.png" alt="Measured Health" className={className} />
  );
}

export function Mark({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <img src="/brand/mark.svg" alt="Measured Health" className={className} />
  );
}

/** BHAI is a text placeholder until the official logo arrives (spec §3, Partner). */
export function PartnerLine() {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-3">
      <span>In partnership with</span>
      <b className="font-display text-lg font-black tracking-wide text-bloom">
        BHAI
      </b>
      <span aria-hidden className="h-3.5 w-px bg-lilac-2" />
      <span>University of Chicago</span>
    </p>
  );
}
```

- [ ] **Step 6: Run the test and checks**

Run: `npx vitest run components/ui/brand.test.tsx && npm run lint && npm run typecheck`
Expected: 3 tests PASS. Lint and typecheck are clean.

- [ ] **Step 7: Commit**

```bash
git add -A package.json package-lock.json vitest.config.mts tests/setup.ts app/layout.tsx app/globals.css components/ui/brand.tsx components/ui/brand.test.tsx public
git commit -m "Set up tests, design v3 tokens, fonts and brand assets"
```

---

### Task 2: Result mapping, labels and the API contract types

The safety core: one pure function decides everything a result screen
shows.

**Files:**

- Create: `lib/api/contract.ts`, `lib/labels.ts`, `lib/result-view.ts`, `lib/result-view.test.ts`, `lib/labels.test.ts`

**Interfaces:**

- Produces:
  - from `lib/api/contract.ts`: `QueryCreateIn`, `QueryStatusOut`, `ClinicalResultOut`, `Citation`, `Stage`, `FeedbackIn`, `FeedbackOut`, `Readiness`;
  - from `lib/result-view.ts`: `toResultView(r: ClinicalResultOut): ResultView`, and the types `ResultView` and `ResultKind = "high" | "caution" | "review"`;
  - from `lib/labels.ts`: `RESULT_LABEL: Record<ResultKind | "failed", string>`, `STAGES: readonly { id: Stage; label: string }[]`, `FORBIDDEN_TERMS: readonly string[]`, `citationTag(a: Citation["action"]): { label: string; tone: "ok" | "warn" | "bad" }`.

- [ ] **Step 1: Write the contract types**

These mirror the backend spec §4.2. Plan 2 replaces them with types
generated from `openapi.json`. Until then this file is the only
handwritten copy, and it says so.

`lib/api/contract.ts`:

```ts
// Mirrors mhai-multiagent docs/specs/2026-10-08-api-gateway-phase1-design.md §4.2.
// Temporary: Plan 2 replaces this file with types generated from openapi.json.

export type Sex = "female" | "male" | "other" | "unknown";
export type Urgency = "routine" | "urgent" | "emergency";
export type Stage =
  | "pii_masking"
  | "retrieval"
  | "generation"
  | "nli_verification"
  | "hga_verification"
  | "decision";

export interface QueryCreateIn {
  patient_data: {
    age: number;
    sex: Sex;
    symptoms: string[];
    medical_history?: string;
  };
  clinical_question: string;
  urgency: Urgency;
  specialty?: string;
}

export interface QueryStatusOut {
  query_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number; // 0–1
  current_stage: Stage | null;
  error_code?: string;
}

export interface Citation {
  chunk_id: string;
  source_title: string;
  excerpt: string;
  claim_text: string;
  nli_label: "ENTAILMENT" | "NEUTRAL" | "CONTRADICTION";
  nli_confidence: number;
  action: "PASS" | "FLAG" | "REDACT";
  reason: string;
}

export interface ClinicalResultOut {
  query_id: string;
  decision: "PASS" | "REGENERATE" | "ESCALATE";
  verified: boolean;
  degraded: boolean;
  failed_agents: ("CCA" | "HGA")[];
  response_available: boolean;
  diagnosis: string | null;
  icd10_code: string | null;
  response_text: string;
  trust_score: number | null;
  citations: Citation[];
  guardrail_details: {
    l1_persona: null;
    l2_entropy: { stability: number } | null;
    l3_nli: {
      pass_rate: number;
      claims_checked: number;
      model_loaded: boolean;
    };
    l4_trust: {
      trust_score: number;
      base_trust: number;
      flag_penalty: number;
    } | null;
    cascade_pass: boolean;
  };
  retrieval_ms: number;
  generation_ms: number;
}

export type FeedbackIn =
  | { query_id: string; action: "validate" }
  | {
      query_id: string;
      action: "correct";
      corrected_diagnosis: string;
      reason: string;
    };

export interface FeedbackOut {
  status: "recorded" | "pending_review";
  correction_id?: string;
}

export interface Readiness {
  ok: boolean;
  degraded_services: string[];
}
```

- [ ] **Step 2: Write the failing tests**

`lib/result-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { ClinicalResultOut, Citation } from "./api/contract";
import { toResultView } from "./result-view";

const cite = (
  action: Citation["action"],
  title = "AHA 2021 Chest Pain",
): Citation => ({
  chunk_id: `c-${action}-${title}`,
  source_title: title,
  excerpt: "…",
  claim_text: "claim",
  nli_label: "ENTAILMENT",
  nli_confidence: 0.9,
  action,
  reason: "",
});

const base = (o: Partial<ClinicalResultOut> = {}): ClinicalResultOut => ({
  query_id: "q1",
  decision: "PASS",
  verified: true,
  degraded: false,
  failed_agents: [],
  response_available: true,
  diagnosis: "Unstable angina",
  icd10_code: "I20.0",
  response_text: "Summary.",
  trust_score: 0.82,
  citations: [cite("PASS")],
  guardrail_details: {
    l1_persona: null,
    l2_entropy: null,
    l3_nli: { pass_rate: 0.92, claims_checked: 4, model_loaded: true },
    l4_trust: { trust_score: 0.82, base_trust: 0.9, flag_penalty: 0.08 },
    cascade_pass: true,
  },
  retrieval_ms: 2100,
  generation_ms: 9700,
  ...o,
});

describe("toResultView", () => {
  it("maps PASS to high confidence with 4 bars", () => {
    const v = toResultView(base());
    expect(v.kind).toBe("high");
    expect(v.confidence).toEqual({ label: "High confidence", bars: 4 });
    expect(v.banner).toBeNull();
  });

  it("gives 5 bars to a very high trust score", () => {
    expect(toResultView(base({ trust_score: 0.9 })).confidence?.bars).toBe(5);
  });

  it("maps REGENERATE to use with caution with an amber banner", () => {
    const v = toResultView(base({ decision: "REGENERATE", trust_score: 0.42 }));
    expect(v.kind).toBe("caution");
    expect(v.confidence).toEqual({ label: "Use with caution", bars: 3 });
    expect(v.banner?.tone).toBe("warn");
  });

  it("maps ESCALATE to needs review: red banner, no confidence", () => {
    const v = toResultView(base({ decision: "ESCALATE", trust_score: 0.2 }));
    expect(v.kind).toBe("review");
    expect(v.confidence).toBeNull();
    expect(v.banner).toEqual({
      tone: "bad",
      title:
        "This result needs clinician review before any clinical action is taken",
    });
  });

  it("treats a degraded PASS as needs review (safety rule)", () => {
    const v = toResultView(base({ degraded: true, trust_score: null }));
    expect(v.kind).toBe("review");
    expect(v.confidence).toBeNull();
  });

  it("adds the reduced-accuracy notice when the evidence model is not loaded", () => {
    const r = base();
    r.guardrail_details.l3_nli.model_loaded = false;
    expect(toResultView(r).reducedAccuracy).toBe(true);
  });

  it("hides the ICD-10 chip and diagnosis when missing", () => {
    const v = toResultView(base({ icd10_code: null, diagnosis: null }));
    expect(v.icd10).toBeNull();
    expect(v.title).toBe("Clinical assessment");
  });

  it("only returns confidence bars the API provided", () => {
    const v = toResultView(base());
    expect(v.measures.map((m) => m.label)).toEqual(["Evidence match"]);
    const withStability = base();
    withStability.guardrail_details.l2_entropy = { stability: 0.61 };
    expect(toResultView(withStability).measures.map((m) => m.label)).toEqual([
      "Evidence match",
      "Answer stability",
    ]);
  });

  it("counts verified claims and groups sources with use counts", () => {
    const v = toResultView(
      base({
        citations: [
          cite("PASS"),
          cite("PASS"),
          cite("FLAG", "WHO Dengue 2024"),
          cite("REDACT", "BNF"),
        ],
      }),
    );
    expect(v.claims).toEqual({ verified: 2, total: 4 });
    expect(v.sources).toEqual([
      {
        title: "AHA 2021 Chest Pain",
        status: "verified",
        uses: 2,
        excerpt: "…",
      },
      { title: "WHO Dengue 2024", status: "review", uses: 1, excerpt: "…" },
      { title: "BNF", status: "removed", uses: 1, excerpt: "…" },
    ]);
  });

  it("copes with no citations and empty text", () => {
    const v = toResultView(base({ citations: [], response_text: "" }));
    expect(v.claims).toEqual({ verified: 0, total: 0 });
    expect(v.sources).toEqual([]);
    expect(v.body).toBe("");
  });

  it("reports total time in seconds with one decimal", () => {
    expect(toResultView(base()).seconds).toBe("11.8");
  });
});
```

`lib/labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FORBIDDEN_TERMS, RESULT_LABEL, STAGES, citationTag } from "./labels";

describe("labels", () => {
  it("uses plain language only", () => {
    const shown = [
      ...Object.values(RESULT_LABEL),
      ...STAGES.map((s) => s.label),
      ...(["PASS", "FLAG", "REDACT"] as const).map((a) => citationTag(a).label),
    ].join(" ");
    for (const term of FORBIDDEN_TERMS)
      expect(shown.toLowerCase()).not.toContain(term.toLowerCase());
  });
  it("lists the six analysing steps in order", () => {
    expect(STAGES.map((s) => s.label)).toEqual([
      "Protecting patient privacy",
      "Searching medical guidelines",
      "Generating clinical assessment",
      "Verifying against evidence",
      "Running safety checks",
      "Finalising recommendation",
    ]);
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `npx vitest run lib`
Expected: FAIL, because the modules aren't found.

- [ ] **Step 4: Implement**

`lib/labels.ts`:

```ts
import type { Citation, Stage } from "./api/contract";

export type ResultKind = "high" | "caution" | "review";

export const RESULT_LABEL: Record<ResultKind | "failed", string> = {
  high: "High confidence",
  caution: "Use with caution",
  review: "Needs review",
  failed: "Couldn't complete",
};

export const STAGES: readonly { id: Stage; label: string }[] = [
  { id: "pii_masking", label: "Protecting patient privacy" },
  { id: "retrieval", label: "Searching medical guidelines" },
  { id: "generation", label: "Generating clinical assessment" },
  { id: "nli_verification", label: "Verifying against evidence" },
  { id: "hga_verification", label: "Running safety checks" },
  { id: "decision", label: "Finalising recommendation" },
];

export const FORBIDDEN_TERMS = [
  "trust score",
  "NLI",
  "entropy",
  "PASS",
  "REGENERATE",
  "ESCALATE",
  "guardrail",
  "KB#",
] as const;

export function citationTag(action: Citation["action"]): {
  label: string;
  tone: "ok" | "warn" | "bad";
} {
  if (action === "PASS") return { label: "Verified", tone: "ok" };
  if (action === "FLAG") return { label: "Needs review", tone: "warn" };
  return { label: "Removed: unsupported", tone: "bad" };
}
```

`lib/result-view.ts`:

```ts
import type { ClinicalResultOut } from "./api/contract";
import { RESULT_LABEL, type ResultKind } from "./labels";

export type { ResultKind };

export interface ResultView {
  kind: ResultKind;
  title: string;
  icd10: string | null;
  body: string;
  confidence: { label: string; bars: 1 | 2 | 3 | 4 | 5 } | null;
  banner: { tone: "warn" | "bad"; title: string } | null;
  reducedAccuracy: boolean;
  claims: { verified: number; total: number };
  measures: { label: string; value: number }[]; // 0–1, only those the API returned
  sources: {
    title: string;
    status: "verified" | "review" | "removed";
    uses: number;
    excerpt: string;
  }[];
  seconds: string;
}

function barsFor(score: number | null, kind: ResultKind): 1 | 2 | 3 | 4 | 5 {
  if (kind === "high") return score !== null && score >= 0.85 ? 5 : 4;
  return score !== null && score >= 0.42 ? 3 : 2;
}

export function toResultView(r: ClinicalResultOut): ResultView {
  // Safety rule: degraded or escalated → needs review, never a confidence level.
  const kind: ResultKind =
    r.degraded || r.decision === "ESCALATE"
      ? "review"
      : r.decision === "REGENERATE"
        ? "caution"
        : "high";

  const banner: ResultView["banner"] =
    kind === "review"
      ? {
          tone: "bad",
          title:
            "This result needs clinician review before any clinical action is taken",
        }
      : kind === "caution"
        ? { tone: "warn", title: "Use with caution" }
        : null;

  const verified = r.citations.filter((c) => c.action === "PASS").length;

  const measures: ResultView["measures"] = [
    { label: "Evidence match", value: r.guardrail_details.l3_nli.pass_rate },
  ];
  if (r.guardrail_details.l2_entropy) {
    measures.push({
      label: "Answer stability",
      value: r.guardrail_details.l2_entropy.stability,
    });
  }

  const byTitle = new Map<string, ResultView["sources"][number]>();
  for (const c of r.citations) {
    const status =
      c.action === "PASS"
        ? "verified"
        : c.action === "FLAG"
          ? "review"
          : "removed";
    const seen = byTitle.get(c.source_title);
    if (seen) seen.uses += 1;
    else
      byTitle.set(c.source_title, {
        title: c.source_title,
        status,
        uses: 1,
        excerpt: c.excerpt,
      });
  }

  return {
    kind,
    title: r.diagnosis ?? "Clinical assessment",
    icd10: r.icd10_code,
    body: r.response_text,
    confidence:
      kind === "review"
        ? null
        : { label: RESULT_LABEL[kind], bars: barsFor(r.trust_score, kind) },
    banner,
    reducedAccuracy: !r.guardrail_details.l3_nli.model_loaded,
    claims: { verified, total: r.citations.length },
    measures,
    sources: [...byTitle.values()],
    seconds: ((r.retrieval_ms + r.generation_ms) / 1000).toFixed(1),
  };
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib
git commit -m "Map API results to what the screen shows, with safety rules"
```

---

### Task 3: UI primitives

**Files:**

- Create: `components/ui/button.tsx`, `chip.tsx`, `confidence-pill.tsx`, `banner.tsx`, `dialog.tsx`, `sheet.tsx`, `skeleton.tsx`, `toast.tsx`, `cn.ts`, `primitives.test.tsx`

**Interfaces:**

- Consumes: the tokens from Task 1, and `ResultView["confidence"]` from Task 2.
- Produces:
  - `cn(...c: (string|false|null|undefined)[]): string`;
  - `<Button variant="primary"|"agree"|"soft"|"ghost"|"danger" size="md"|"sm">`;
  - `<Chip tone="brand"|"ok"|"warn"|"bad"|"mint">`;
  - `<ConfidencePill label bars />`;
  - `<Banner tone="warn"|"bad"|"ok"|"info" title>{children}</Banner>`;
  - `<Dialog open onClose title>{children}</Dialog>`;
  - `<Sheet open onClose title>{children}</Sheet>`;
  - `<Skeleton className />`;
  - `<ToastProvider>`, `useToast(): { show(t: { title: string; body?: string; tone?: "ok"|"info"; ms?: number }): void }`.

- [ ] **Step 1: Write the failing tests**

`components/ui/primitives.test.tsx`:

```tsx
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfidencePill } from "./confidence-pill";
import { Banner } from "./banner";
import { Dialog } from "./dialog";
import { ToastProvider, useToast } from "./toast";

describe("ConfidencePill", () => {
  it("states the level in words and bars, not colour alone", () => {
    render(<ConfidencePill label="High confidence" bars={4} />);
    const pill = screen.getByRole("status", {
      name: "High confidence, 4 of 5 bars",
    });
    expect(pill).toHaveTextContent("High");
    expect(pill.querySelectorAll("[data-bar=on]")).toHaveLength(4);
  });
});

describe("Banner", () => {
  it("is announced as an alert when it is a safety banner", () => {
    render(
      <Banner tone="bad" title="Needs review">
        Text
      </Banner>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Needs review");
  });
});

describe("Dialog", () => {
  it("closes on Escape and moves focus inside", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Discard this draft?">
        <button>Keep editing</button>
      </Dialog>,
    );
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Keep editing")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("Toast", () => {
  it("shows and auto-dismisses", () => {
    vi.useFakeTimers();
    function Fire() {
      const t = useToast();
      return (
        <button onClick={() => t.show({ title: "Copied", ms: 1000 })}>
          go
        </button>
      );
    }
    render(
      <ToastProvider>
        <Fire />
      </ToastProvider>,
    );
    act(() => screen.getByText("go").click());
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    act(() => vi.advanceTimersByTime(1100));
    expect(screen.queryByText("Copied")).toBeNull();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/ui/primitives.test.tsx`
Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement**

`components/ui/cn.ts`:

```ts
export const cn = (...c: (string | false | null | undefined)[]) =>
  c.filter(Boolean).join(" ");
```

`components/ui/button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

const VARIANT = {
  primary:
    "bg-gradient-to-br from-mint to-mint-deep text-white shadow-[0_14px_28px_-12px_var(--color-mint)]",
  agree: "bg-bloom text-white",
  soft: "bg-lilac text-bloom",
  ghost: "bg-white border border-line text-ink-2",
  danger: "bg-white border border-bad-line text-bad",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANT;
  size?: "md" | "sm";
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold",
        "transition-[transform,filter] duration-[var(--t-instant)] ease-[var(--e-out)] active:scale-[.96] hover:brightness-105",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-mint/25 disabled:opacity-40 disabled:pointer-events-none",
        size === "md" ? "min-h-11 px-5 text-sm" : "min-h-9 px-3.5 text-[13px]",
        VARIANT[variant],
        className,
      )}
    />
  );
}
```

`components/ui/chip.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

const TONE = {
  brand: "bg-lilac text-bloom",
  ok: "bg-ok-wash text-ok-deep",
  warn: "bg-warn-wash text-warn-deep",
  bad: "bg-bad-wash text-bad-deep",
  mint: "bg-mint-wash text-mint-deep",
} as const;

export function Chip({
  tone = "brand",
  mono,
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  mono?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        mono && "font-mono",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
```

`components/ui/confidence-pill.tsx`:

```tsx
import { cn } from "./cn";

const HEIGHTS = [6, 8, 10, 12, 14];

export function ConfidencePill({
  label,
  bars,
}: {
  label: string;
  bars: 1 | 2 | 3 | 4 | 5;
}) {
  const tone = label.startsWith("High")
    ? "bg-ok-wash text-ok-deep"
    : "bg-warn-wash text-warn-deep";
  const word = label.replace(/ confidence$/, "");
  return (
    <span
      role="status"
      aria-label={`${label}, ${bars} of 5 bars`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold",
        tone,
      )}
    >
      <span aria-hidden className="inline-flex items-end gap-0.5">
        {HEIGHTS.map((h, i) => (
          <i
            key={h}
            data-bar={i < bars ? "on" : "off"}
            style={{ height: h }}
            className={cn(
              "block w-1 rounded-sm bg-current",
              i >= bars && "opacity-20",
            )}
          />
        ))}
      </span>
      {word}
      {label.endsWith("confidence") && (
        <span
          aria-hidden
          className="text-[9.5px] font-semibold uppercase tracking-[.12em] opacity-70"
        >
          confidence
        </span>
      )}
    </span>
  );
}
```

`components/ui/banner.tsx`:

```tsx
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";
import { cn } from "./cn";

const TONE = {
  warn: {
    box: "bg-warn-wash border-warn-line text-warn-deep",
    Icon: AlertTriangle,
  },
  bad: { box: "bg-bad-wash border-bad-line text-bad-deep", Icon: OctagonAlert },
  ok: { box: "bg-ok-wash border-[#a8d9bf] text-ok-deep", Icon: CheckCircle2 },
  info: { box: "bg-[#fff8dc] border-[#f1df9a] text-[#7a6512]", Icon: Info },
} as const;

/** Safety banners appear once, then stay still (spec §3 Motion: never pulse). */
export function Banner({
  tone,
  title,
  children,
}: {
  tone: keyof typeof TONE;
  title: string;
  children?: ReactNode;
}) {
  const { box, Icon } = TONE[tone];
  return (
    <div
      role={tone === "bad" || tone === "warn" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3.5 text-[13.5px] leading-normal",
        box,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>
        <b className="block text-sm">{title}</b>
        {children}
      </div>
    </div>
  );
}
```

`components/ui/dialog.tsx` (native `<dialog>` gives a focus trap, Esc
handling and the inert backdrop):

```tsx
"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
      d.querySelector<HTMLElement>(
        "button, [href], input, textarea, select",
      )?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlg-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="w-[min(440px,92vw)] rounded-3xl bg-white p-6 text-ink shadow-[0_40px_80px_-30px_#1c0d22aa] backdrop:bg-ink/40 backdrop:backdrop-blur-sm"
    >
      <h2
        id="dlg-title"
        className="mb-2 font-display text-[32px] font-black leading-none"
      >
        {title}
      </h2>
      {children}
    </dialog>
  );
}
```

`components/ui/sheet.tsx` (the mobile bottom sheet; it closes on Esc,
on a backdrop click, or when the grab handle is dragged down):

```tsx
"use client";
import { useEffect, type ReactNode } from "react";
import { cn } from "./cn";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <div
      aria-hidden={!open}
      className={cn("fixed inset-0 z-40", !open && "pointer-events-none")}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/35 transition-opacity duration-[var(--t-base)]",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto rounded-t-[26px] bg-white px-4 pb-6 pt-2.5 shadow-2xl",
          "transition-transform duration-[var(--t-slow)] ease-[var(--e-spring)]",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <button
          aria-label="Close"
          onClick={onClose}
          className="mx-auto mb-3 block h-1.5 w-11 rounded-full bg-lilac-2"
        />
        {children}
      </section>
    </div>
  );
}
```

`components/ui/skeleton.tsx`:

```tsx
import { cn } from "./cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-[sk_1.4s_linear_infinite] rounded-lg bg-[linear-gradient(90deg,#ece4ef_0%,#f7f3f9_40%,#ece4ef_80%)] bg-[length:300%_100%]",
        className,
      )}
    />
  );
}
```

Add this to `app/globals.css`:

```css
@keyframes sk {
  from {
    background-position: 100% 0;
  }
  to {
    background-position: -200% 0;
  }
}
```

`components/ui/toast.tsx`:

```tsx
"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

type T = {
  id: number;
  title: string;
  body?: string;
  tone?: "ok" | "info";
  ms?: number;
};
const Ctx = createContext<{ show(t: Omit<T, "id">): void }>({ show() {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const show = useCallback((t: Omit<T, "id">) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { ...t, id }]);
    setTimeout(
      () => setItems((x) => x.filter((i) => i.id !== id)),
      t.ms ?? 3200,
    );
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-5 top-5 z-50 flex w-[340px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto animate-[toastIn_var(--t-slow)_var(--e-spring)_both] rounded-2xl bg-white p-4 text-[13.5px] shadow-[0_30px_60px_-24px_#1c0d2299] ring-1 ring-line"
          >
            <b>{t.title}</b>
            {t.body && <p className="mt-1 text-xs text-ink-3">{t.body}</p>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
```

Add this to `app/globals.css`:

```css
@keyframes toastIn {
  from {
    transform: translateX(120%);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/ui`
Expected: all PASS. If jsdom lacks `showModal`, the fallback branch in
`Dialog` covers it.

- [ ] **Step 5: Commit**

```bash
git add components/ui app/globals.css
git commit -m "Add design v3 UI primitives"
```

---

### Task 4: Form schema and the consultation form

**Files:**

- Create: `lib/form-schema.ts`, `lib/form-schema.test.ts`, `components/form/consultation-form.tsx`, `components/form/segmented.tsx`, `components/form/priority-picker.tsx`, `components/form/symptom-input.tsx`, `components/form/error-summary.tsx`, `components/form/consultation-form.test.tsx`

**Interfaces:**

- Consumes: `QueryCreateIn`, `Sex`, `Urgency` (Task 2); `Button`, `cn` (Task 3).
- Produces:
  - `consultationSchema` (Zod), and `FormValues`, the raw form state:
    `{ age: string; sex: Sex | ""; urgency: Urgency | ""; symptoms: string[]; question: string; specialty: string; history: string }`;
  - `toQuery(v: FormValues): QueryCreateIn`;
  - `validate(v: FormValues): { ok: true; data: QueryCreateIn } | { ok: false; errors: Partial<Record<keyof FormValues, string>> }`;
  - `correctionSchema`;
  - `emptyForm: FormValues`;
  - `<ConsultationForm initial?: FormValues onSubmit(q: QueryCreateIn): void onDirtyChange?(dirty: boolean): void />`.

- [ ] **Step 1: Write the failing schema tests**

`lib/form-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { correctionSchema, emptyForm, validate } from "./form-schema";

const good = {
  ...emptyForm,
  age: "54",
  sex: "male" as const,
  urgency: "urgent" as const,
  symptoms: ["Chest pain"],
  question:
    "Central chest pain for 40 min radiating to left arm. Likely diagnosis?",
};

describe("validate", () => {
  it("accepts a complete form and builds the API body", () => {
    const r = validate(good);
    expect(r.ok && r.data).toEqual({
      patient_data: { age: 54, sex: "male", symptoms: ["Chest pain"] },
      clinical_question: good.question,
      urgency: "urgent",
    });
  });
  it("rejects an age outside 0–120 with a plain message", () => {
    const r = validate({ ...good, age: "154" });
    expect(!r.ok && r.errors.age).toBe("Must be 0–120");
  });
  it("asks for more detail when the question is under 10 characters", () => {
    const r = validate({ ...good, question: "Chest pain".slice(0, 9) });
    expect(!r.ok && r.errors.question).toMatch(/at least 10 characters/);
  });
  it("blocks a question over 2000 characters without trimming it", () => {
    const long = "x".repeat(2001);
    const r = validate({ ...good, question: long });
    expect(!r.ok && r.errors.question).toBe(
      "Shorten to 2000 characters or fewer (now 2001)",
    );
  });
  it("needs at least one symptom and at most 20", () => {
    expect(!validate({ ...good, symptoms: [] }).ok).toBe(true);
    expect(!validate({ ...good, symptoms: Array(21).fill("a") }).ok).toBe(true);
  });
  it("includes optional fields only when filled", () => {
    const r = validate({ ...good, specialty: "Cardiology", history: "T2DM" });
    expect(r.ok && r.data.specialty).toBe("Cardiology");
    expect(r.ok && r.data.patient_data.medical_history).toBe("T2DM");
  });
});

describe("correctionSchema", () => {
  it("requires 3+ characters for both fields", () => {
    expect(
      correctionSchema.safeParse({ corrected_diagnosis: "ab", reason: "abc" })
        .success,
    ).toBe(false);
    expect(
      correctionSchema.safeParse({ corrected_diagnosis: "abc", reason: "abc" })
        .success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run lib/form-schema.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `lib/form-schema.ts`**

```ts
import { z } from "zod";
import type { QueryCreateIn, Sex, Urgency } from "./api/contract";

export interface FormValues {
  age: string;
  sex: Sex | "";
  urgency: Urgency | "";
  symptoms: string[];
  question: string;
  specialty: string;
  history: string;
}

export const emptyForm: FormValues = {
  age: "",
  sex: "",
  urgency: "",
  symptoms: [],
  question: "",
  specialty: "",
  history: "",
};

export const consultationSchema = z.object({
  age: z
    .string()
    .trim()
    .min(1, "Enter the patient's age")
    .refine((s) => /^\d{1,3}$/.test(s) && Number(s) <= 120, "Must be 0–120"),
  sex: z.enum(["female", "male", "other", "unknown"], { error: "Choose one" }),
  urgency: z.enum(["routine", "urgent", "emergency"], {
    error: "Choose a priority",
  }),
  symptoms: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(200, "Keep each symptom under 200 characters"),
    )
    .min(1, "Add at least one symptom")
    .max(20, "Up to 20 symptoms"),
  question: z.string().superRefine((s, ctx) => {
    const n = s.trim().length;
    if (n < 10)
      ctx.addIssue({
        code: "custom",
        message:
          "Add a bit more detail (at least 10 characters). Vitals, duration and history help most.",
      });
    if (s.length > 2000)
      ctx.addIssue({
        code: "custom",
        message: `Shorten to 2000 characters or fewer (now ${s.length})`,
      });
  }),
  specialty: z.string(),
  history: z.string().max(2000, "Keep medical history under 2000 characters"),
});

export function toQuery(v: FormValues): QueryCreateIn {
  return {
    patient_data: {
      age: Number(v.age),
      sex: v.sex as Sex,
      symptoms: v.symptoms.map((s) => s.trim()),
      ...(v.history.trim() ? { medical_history: v.history.trim() } : {}),
    },
    clinical_question: v.question.trim(),
    urgency: v.urgency as Urgency,
    ...(v.specialty ? { specialty: v.specialty } : {}),
  };
}

export function validate(
  v: FormValues,
):
  | { ok: true; data: QueryCreateIn }
  | { ok: false; errors: Partial<Record<keyof FormValues, string>> } {
  const r = consultationSchema.safeParse(v);
  if (r.success) return { ok: true, data: toQuery(v) };
  const errors: Partial<Record<keyof FormValues, string>> = {};
  for (const i of r.error.issues) {
    const k = i.path[0] as keyof FormValues;
    errors[k] ??= i.message;
  }
  return { ok: false, errors };
}

export const correctionSchema = z.object({
  corrected_diagnosis: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(500),
  reason: z
    .string()
    .trim()
    .min(3, "Tell us why (at least 3 characters)")
    .max(1000),
});
```

- [ ] **Step 4: Run the schema tests**

Run: `npx vitest run lib/form-schema.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing form test**

`components/form/consultation-form.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConsultationForm } from "./consultation-form";

describe("ConsultationForm", () => {
  it("shows an error summary, keeps input, and focuses the first error", async () => {
    const onSubmit = vi.fn();
    render(<ConsultationForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/Age/), "154");
    await userEvent.click(screen.getByRole("button", { name: /Analyse/ }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/need fixing/);
    expect(screen.getByLabelText(/Age/)).toHaveValue("154");
    expect(screen.getByLabelText(/Age/)).toHaveFocus();
    expect(screen.getByText("Must be 0–120")).toBeInTheDocument();
  });

  it("submits a valid form with ⌘/Ctrl+Enter", async () => {
    const onSubmit = vi.fn();
    render(<ConsultationForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/Age/), "54");
    await userEvent.click(screen.getByRole("radio", { name: "Male" }));
    await userEvent.click(screen.getByRole("radio", { name: /Urgent/ }));
    await userEvent.type(
      screen.getByLabelText(/Presenting symptoms/),
      "Chest pain{Enter}",
    );
    await userEvent.type(
      screen.getByLabelText(/Clinical question/),
      "Chest pain 40 min, BP 150/95. Diagnosis?",
    );
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        urgency: "urgent",
        clinical_question: "Chest pain 40 min, BP 150/95. Diagnosis?",
      }),
    );
  });

  it("keeps a pasted long question and shows its length", async () => {
    render(<ConsultationForm onSubmit={vi.fn()} />);
    const q = screen.getByLabelText(/Clinical question/);
    await userEvent.click(q);
    await userEvent.paste("y".repeat(2050));
    expect(q).toHaveValue("y".repeat(2050));
    expect(screen.getByText("2050 / 2000")).toBeInTheDocument();
  });

  it("reports dirty state so the page can guard unsaved drafts", async () => {
    const onDirty = vi.fn();
    render(<ConsultationForm onSubmit={vi.fn()} onDirtyChange={onDirty} />);
    await userEvent.type(screen.getByLabelText(/Age/), "5");
    expect(onDirty).toHaveBeenLastCalledWith(true);
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run components/form`. Expected: FAIL.

- [ ] **Step 7: Implement the form components**

`components/form/segmented.tsx`:

```tsx
import { cn } from "../ui/cn";

export function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange(v: T): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-xl bg-lilac p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          name={name}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-10 flex-1 rounded-[9px] text-sm text-ink-2 transition-colors duration-[var(--t-fast)]",
            value === o.value &&
              "bg-white font-semibold text-bloom shadow-[0_2px_8px_-4px_#46035155]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

`components/form/priority-picker.tsx`:

```tsx
import type { Urgency } from "@/lib/api/contract";
import { cn } from "../ui/cn";

const OPTS: { value: Urgency; label: string; hint: string; dot: string }[] = [
  { value: "routine", label: "Routine", hint: "Clinic visit", dot: "bg-mint" },
  { value: "urgent", label: "Urgent", hint: "Same day", dot: "bg-warn" },
  { value: "emergency", label: "Emergency", hint: "Act now", dot: "bg-bad" },
];

export function PriorityPicker({
  value,
  onChange,
}: {
  value: Urgency | "";
  onChange(v: Urgency): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Priority"
      className="grid grid-cols-3 gap-2"
    >
      {OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-h-12 items-center gap-2 rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-left text-sm",
            value === o.value && "border-mint ring-[3px] ring-mint/15",
          )}
        >
          <span aria-hidden className={cn("size-2 rounded-full", o.dot)} />
          <span>
            {o.label}
            <small className="block text-[11px] text-ink-3">{o.hint}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
```

`components/form/symptom-input.tsx`:

```tsx
"use client";
import { useState } from "react";

const SUGGEST = [
  "Shortness of breath",
  "Fever",
  "Nausea",
  "Headache",
  "Dizziness",
  "Abdominal pain",
];

export function SymptomInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string[];
  onChange(v: string[]): void;
  invalid?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const add = (s: string) => {
    const t = s.trim();
    if (t && !value.includes(t) && value.length < 20) onChange([...value, t]);
    setDraft("");
  };
  return (
    <div>
      <div
        className={`flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-white px-3 py-2 ${invalid ? "border-bad ring-4 ring-bad/10" : "border-lilac-2 focus-within:border-mint focus-within:ring-4 focus-within:ring-mint/15"}`}
      >
        {value.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-mint-wash px-2.5 py-1 text-[12.5px] text-mint-deep"
          >
            {s}
            <button
              type="button"
              aria-label={`Remove ${s}`}
              onClick={() => onChange(value.filter((x) => x !== s))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              (e.key === "Enter" || e.key === ",") &&
              !e.metaKey &&
              !e.ctrlKey
            ) {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && value.length)
              onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : "Type and press Enter…"}
          className="min-w-32 flex-1 bg-transparent text-[14px] outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUGGEST.filter((s) => !value.includes(s))
          .slice(0, 4)
          .map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-lilac-2 bg-white px-2.5 py-1 text-xs text-ink-2"
            >
              + {s}
            </button>
          ))}
      </div>
    </div>
  );
}
```

`components/form/error-summary.tsx`:

```tsx
export function ErrorSummary({
  errors,
  labels,
}: {
  errors: Record<string, string | undefined>;
  labels: Record<string, string>;
}) {
  const keys = Object.keys(errors).filter((k) => errors[k]);
  if (!keys.length) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl border border-bad-line bg-bad-wash px-4 py-3 text-[13.5px] text-bad-deep"
    >
      <b className="block">
        {keys.length === 1 ? "1 thing needs" : `${keys.length} things need`}{" "}
        fixing before we can analyse
      </b>
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && " · "}
          <a href={`#f-${k}`} className="underline">
            {labels[k]}: {errors[k]}
          </a>
        </span>
      ))}
    </div>
  );
}
```

`components/form/consultation-form.tsx`. On mobile (below `md`) the
three groups become steps with a progress bar. At `md` and above, all
three groups show at once.

```tsx
"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import type { QueryCreateIn } from "@/lib/api/contract";
import { emptyForm, validate, type FormValues } from "@/lib/form-schema";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { ErrorSummary } from "./error-summary";
import { PriorityPicker } from "./priority-picker";
import { Segmented } from "./segmented";
import { SymptomInput } from "./symptom-input";

const LABELS: Record<keyof FormValues, string> = {
  age: "Age",
  sex: "Sex",
  urgency: "Priority",
  symptoms: "Presenting symptoms",
  question: "Clinical question",
  specialty: "Specialty area",
  history: "Medical history",
};
const STEP_OF: Record<keyof FormValues, 0 | 1 | 2> = {
  age: 0,
  sex: 0,
  urgency: 0,
  symptoms: 1,
  question: 1,
  specialty: 2,
  history: 2,
};
const input =
  "w-full rounded-xl border bg-white px-3.5 py-2.5 text-[15px] outline-none transition-shadow duration-[var(--t-fast)] focus:border-mint focus:ring-4 focus:ring-mint/15";
const bad = "border-bad ring-4 ring-bad/10";

function Field({
  id,
  label,
  required,
  error,
  children,
  hint,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id={`f-${id}`}>
      <label
        htmlFor={id}
        className="mb-1.5 flex justify-between text-[12.5px] text-ink-2"
      >
        <span>{label}</span>
        {required && (
          <span aria-hidden className="text-bad">
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1.5 animate-[fadeUp_var(--t-fast)_var(--e-out)_both] text-[12.5px] text-bad">
          ✕ {error}
        </p>
      )}
      {hint}
    </div>
  );
}

export function ConsultationForm({
  initial = emptyForm,
  onSubmit,
  onDirtyChange,
}: {
  initial?: FormValues;
  onSubmit(q: QueryCreateIn): void;
  onDirtyChange?(dirty: boolean): void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<
    Partial<Record<keyof FormValues, string>>
  >({});
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [moreOpen, setMoreOpen] = useState(Boolean(initial.history));
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof FormValues>(k: K, val: FormValues[K]) =>
    setV((x) => ({ ...x, [k]: val }));

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(v) !== JSON.stringify(emptyForm));
  }, [v, onDirtyChange]);

  const submit = () => {
    const r = validate(v);
    if (r.ok) {
      setErrors({});
      onSubmit(r.data);
      return;
    }
    setErrors(r.errors);
    const first = (Object.keys(LABELS) as (keyof FormValues)[]).find(
      (k) => r.errors[k],
    )!;
    setStep(STEP_OF[first]);
    // Groups are hidden with CSS only, so the field is already in the DOM.
    formRef.current
      ?.querySelector<HTMLElement>(
        `#${first}, #f-${first} [role=radio], #f-${first} button`,
      )
      ?.focus();
  };

  const group = (n: 0 | 1 | 2) =>
    cn(
      "border-t border-line py-[18px] first:border-t-0 first:pt-1",
      step !== n && "max-md:hidden",
    );

  return (
    <form
      ref={formRef}
      noValidate
      className="card-v3 px-5 py-5 md:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div aria-hidden className="mb-3 flex gap-1.5 md:hidden">
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i <= step ? "bg-mint" : "bg-lilac-2",
            )}
          />
        ))}
      </div>
      <ErrorSummary errors={errors} labels={LABELS} />

      <fieldset className={group(0)}>
        <legend className="mb-3 flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-mint">
            01
          </span>
          <b className="text-sm">Patient</b>
        </legend>
        <div className="grid grid-cols-[140px_1fr] gap-3.5 max-sm:grid-cols-1">
          <Field id="age" label="Age" required error={errors.age}>
            <input
              id="age"
              inputMode="numeric"
              value={v.age}
              onChange={(e) => set("age", e.target.value)}
              className={cn(
                input,
                "font-mono tabular",
                errors.age ? bad : "border-lilac-2",
              )}
            />
          </Field>
          <Field id="sex" label="Sex" required error={errors.sex}>
            <Segmented
              name="sex"
              label="Sex"
              value={v.sex}
              onChange={(x) => set("sex", x)}
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
        </div>
        <div className="mt-3.5">
          <Field id="urgency" label="Priority" required error={errors.urgency}>
            <PriorityPicker
              value={v.urgency}
              onChange={(x) => set("urgency", x)}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className={group(1)}>
        <legend className="mb-3 flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-mint">
            02
          </span>
          <b className="text-sm">Presentation</b>
        </legend>
        <Field
          id="symptoms"
          label="Presenting symptoms"
          required
          error={errors.symptoms}
        >
          <SymptomInput
            id="symptoms"
            value={v.symptoms}
            onChange={(x) => set("symptoms", x)}
            invalid={Boolean(errors.symptoms)}
          />
        </Field>
        <div className="mt-3.5">
          <Field
            id="question"
            label="Clinical question"
            required
            error={errors.question}
            hint={
              <p className="mt-1.5 flex justify-between text-xs text-ink-3">
                <span>Tip: include vitals, duration and relevant history.</span>
                <span
                  className={cn(
                    "font-mono tabular",
                    v.question.length > 2000 && "font-semibold text-bad",
                  )}
                >
                  {v.question.length} / 2000
                </span>
              </p>
            }
          >
            <textarea
              id="question"
              rows={5}
              value={v.question}
              onChange={(e) => set("question", e.target.value)}
              className={cn(
                input,
                "min-h-28 leading-relaxed",
                errors.question ? bad : "border-lilac-2",
              )}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className={group(2)}>
        <legend className="mb-3 flex items-baseline gap-2.5">
          <span className="font-mono text-[11px] font-semibold text-mint">
            03
          </span>
          <b className="text-sm">Optional</b>
        </legend>
        <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
          <Field id="specialty" label="Specialty area">
            <select
              id="specialty"
              value={v.specialty}
              onChange={(e) => set("specialty", e.target.value)}
              className={cn(input, "border-lilac-2")}
            >
              <option value="">Let the system decide</option>
              <option>Diagnosis</option>
              <option>Emergency</option>
            </select>
          </Field>
          <div className="self-end">
            <button
              type="button"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((o) => !o)}
              className={cn(input, "border-lilac-2 text-left text-ink-2")}
            >
              {moreOpen ? "−" : "＋"} Additional context (medical history)
            </button>
          </div>
        </div>
        {moreOpen && (
          <div className="mt-3.5">
            <Field id="history" label="Medical history" error={errors.history}>
              <textarea
                id="history"
                rows={3}
                value={v.history}
                onChange={(e) => set("history", e.target.value)}
                className={cn(input, "border-lilac-2")}
              />
            </Field>
          </div>
        )}
      </fieldset>

      <div className="flex items-center gap-3 pt-4">
        {step > 0 && (
          <Button
            type="button"
            variant="ghost"
            className="md:hidden"
            onClick={() => setStep((s) => (s - 1) as 0 | 1)}
          >
            ←
          </Button>
        )}
        {step < 2 && (
          <Button
            type="button"
            className="flex-1 md:hidden"
            onClick={() => setStep((s) => (s + 1) as 1 | 2)}
          >
            Next
          </Button>
        )}
        <Button type="submit" className={cn(step < 2 && "max-md:hidden")}>
          <Send aria-hidden className="size-4" />
          Analyse
          <kbd className="ml-1 rounded border border-white/40 px-1.5 font-mono text-[10.5px] max-md:hidden">
            ⌘ ↵
          </kbd>
        </Button>
        <span className="text-[12.5px] text-ink-3 max-md:hidden">
          Patient details are masked before analysis.
        </span>
      </div>
    </form>
  );
}
```

- [ ] **Step 8: Run the tests**

Run: `npx vitest run components/form lib/form-schema.test.ts`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add lib/form-schema.ts lib/form-schema.test.ts components/form
git commit -m "Add the consultation form with validation and mobile steps"
```

---

### Task 5: The client interface and the mock client

**Files:**

- Create: `lib/api/client.ts`, `lib/api/fixtures.ts`, `lib/api/mock.ts`, `lib/api/mock.test.ts`, `.env.example`

**Interfaces:**

- Consumes: the contract types (Task 2).
- Produces:
  - `interface MhaiClient { createQuery(q: QueryCreateIn): Promise<{ query_id: string }>; getStatus(id: string): Promise<QueryStatusOut>; getResult(id: string): Promise<ClinicalResultOut>; sendFeedback(f: FeedbackIn): Promise<FeedbackOut>; getReadiness(): Promise<Readiness> }`;
  - `getClient(): MhaiClient`;
  - `createMockClient(opts?: { stepMs?: number; now?: () => number }): MhaiClient`;
  - `FIXTURES: Record<"high"|"caution"|"review"|"failed", ...>`;
  - `pickScenario(q: QueryCreateIn): "high"|"caution"|"review"|"failed"`.

**Mock rules:** the scenario is picked from the question text, so testers can
reach every state on purpose:

- contains "fail" → `failed`;
- contains "potassium" or "review" → `review` (ESCALATE);
- contains "fever" or "dengue" → `caution` (REGENERATE);
- anything else → `high` (PASS).

Each stage takes `stepMs` (default 1500 ms).

- [ ] **Step 1: Write the failing test**

`lib/api/mock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createMockClient, pickScenario } from "./mock";

const q = (text: string) => ({
  patient_data: { age: 54, sex: "male" as const, symptoms: ["x"] },
  clinical_question: text,
  urgency: "routine" as const,
});

describe("mock client", () => {
  it("picks scenarios from the question text", () => {
    expect(pickScenario(q("chest pain"))).toBe("high");
    expect(pickScenario(q("fever and rash, dengue?"))).toBe("caution");
    expect(pickScenario(q("low potassium"))).toBe("review");
    expect(pickScenario(q("please fail"))).toBe("failed");
  });

  it("walks through stages, then completes with a result", async () => {
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("chest pain"));
    expect((await c.getStatus(query_id)).current_stage).toBe("pii_masking");
    t = 25;
    const mid = await c.getStatus(query_id);
    expect(mid.status).toBe("processing");
    expect(mid.current_stage).toBe("generation");
    t = 1000;
    expect((await c.getStatus(query_id)).status).toBe("completed");
    expect((await c.getResult(query_id)).decision).toBe("PASS");
  });

  it("ends failed for the failed scenario and has no result", async () => {
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("fail"));
    t = 35;
    const s = await c.getStatus(query_id);
    expect(s.status).toBe("failed");
    expect(s.error_code).toBe("pipeline_timeout");
    await expect(c.getResult(query_id)).rejects.toThrow("result_not_ready");
  });

  it("records feedback; corrections go to review", async () => {
    const c = createMockClient();
    expect(await c.sendFeedback({ query_id: "q", action: "validate" })).toEqual(
      { status: "recorded" },
    );
    expect(
      (
        await c.sendFeedback({
          query_id: "q",
          action: "correct",
          corrected_diagnosis: "abc",
          reason: "abc",
        })
      ).status,
    ).toBe("pending_review");
  });

  it("never touches browser storage", async () => {
    const before = window.localStorage.length + window.sessionStorage.length;
    const c = createMockClient({ stepMs: 1 });
    await c.createQuery(q("chest pain"));
    expect(window.localStorage.length + window.sessionStorage.length).toBe(
      before,
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run lib/api`. Expected: FAIL.

- [ ] **Step 3: Implement the fixtures**

`lib/api/fixtures.ts` (synthetic only):

```ts
import type { Citation, ClinicalResultOut } from "./contract";

const c = (
  title: string,
  claim: string,
  excerpt: string,
  action: Citation["action"] = "PASS",
): Citation => ({
  chunk_id: `${title}-${claim}`.slice(0, 40),
  source_title: title,
  excerpt,
  claim_text: claim,
  nli_label:
    action === "PASS"
      ? "ENTAILMENT"
      : action === "FLAG"
        ? "NEUTRAL"
        : "CONTRADICTION",
  nli_confidence: action === "PASS" ? 0.93 : 0.4,
  action,
  reason: "",
});

const gd = (
  pass: number,
  n: number,
  loaded = true,
): ClinicalResultOut["guardrail_details"] => ({
  l1_persona: null,
  l2_entropy: null,
  l3_nli: { pass_rate: pass, claims_checked: n, model_loaded: loaded },
  l4_trust: { trust_score: pass, base_trust: pass, flag_penalty: 0 },
  cascade_pass: pass > 0.5,
});

export const FIXTURES = {
  high: {
    query_id: "",
    decision: "PASS",
    verified: true,
    degraded: false,
    failed_agents: [],
    response_available: true,
    diagnosis: "Unstable angina",
    icd10_code: "I20.0",
    response_text:
      "Presentation is consistent with acute coronary syndrome in a high-risk patient (smoker, type 2 diabetes).\n- 12-lead ECG within 10 minutes of arrival [1]\n- Serial high-sensitivity troponin at 0 and 3 hours [2]\n- Aspirin 300 mg chewed, unless contraindicated [3]\n- Risk-stratify with HEART score before disposition [4]",
    trust_score: 0.82,
    citations: [
      c(
        "AHA 2021 Chest Pain Guideline",
        "12-lead ECG within 10 minutes of arrival",
        "Obtain a 12-lead ECG within 10 minutes of arrival…",
      ),
      c(
        "ESC 2023 ACS Guideline",
        "Serial high-sensitivity troponin at 0 and 3 hours",
        "Serial hs-cTn at 0h/3h…",
      ),
      c(
        "AHA 2021 Chest Pain Guideline",
        "Aspirin 300 mg chewed, unless contraindicated",
        "Aspirin 162–325 mg chewed…",
      ),
      c(
        "NICE CG95",
        "Risk-stratify with HEART score before disposition",
        "Use a validated risk score…",
      ),
    ],
    guardrail_details: gd(0.92, 4),
    retrieval_ms: 2100,
    generation_ms: 9700,
  },
  caution: {
    query_id: "",
    decision: "REGENERATE",
    verified: false,
    degraded: false,
    failed_agents: [],
    response_available: true,
    diagnosis: "Dengue fever, likely",
    icd10_code: "A90",
    response_text:
      "Febrile illness with rash in an endemic area.\n- NS1 antigen test and full blood count [1]\n- Oral fluids, paracetamol for fever; avoid NSAIDs [2]\n- Admit if platelets fall below 100 × 10⁹/L [3]",
    trust_score: 0.42,
    citations: [
      c(
        "WHO Dengue Guidelines 2024",
        "NS1 antigen test and full blood count",
        "NS1 antigen detection in the first 5 days…",
      ),
      c(
        "WHO Dengue Guidelines 2024",
        "Oral fluids, paracetamol for fever; avoid NSAIDs",
        "Avoid NSAIDs; use paracetamol for fever…",
      ),
      c(
        "Unmatched claim",
        "Admit if platelets fall below 100 × 10⁹/L",
        "",
        "FLAG",
      ),
    ],
    guardrail_details: gd(0.66, 3),
    retrieval_ms: 2400,
    generation_ms: 10100,
  },
  review: {
    query_id: "",
    decision: "ESCALATE",
    verified: false,
    degraded: false,
    failed_agents: [],
    response_available: true,
    diagnosis: "Hypokalaemia, cause unclear",
    icd10_code: "E87.6",
    response_text:
      "Serum K⁺ 2.9 mmol/L. Several suggested causes and replacement doses could not be verified.\n- Check magnesium and renal function [1]\n- IV potassium 40 mmol over 1 hour via peripheral line [2]",
    trust_score: 0.21,
    citations: [
      c(
        "BNF: Potassium chloride",
        "Check magnesium and renal function",
        "Correct hypomagnesaemia…",
        "FLAG",
      ),
      c(
        "BNF: Potassium chloride",
        "IV potassium 40 mmol over 1 hour via peripheral line",
        "",
        "REDACT",
      ),
    ],
    guardrail_details: gd(0.25, 4, false),
    retrieval_ms: 2600,
    generation_ms: 11600,
  },
} satisfies Record<string, ClinicalResultOut>;
```

- [ ] **Step 4: Implement the client**

`lib/api/client.ts`:

```ts
import type {
  ClinicalResultOut,
  FeedbackIn,
  FeedbackOut,
  QueryCreateIn,
  QueryStatusOut,
  Readiness,
} from "./contract";
import { createMockClient } from "./mock";

export interface MhaiClient {
  createQuery(q: QueryCreateIn): Promise<{ query_id: string }>;
  getStatus(id: string): Promise<QueryStatusOut>;
  getResult(id: string): Promise<ClinicalResultOut>;
  sendFeedback(f: FeedbackIn): Promise<FeedbackOut>;
  getReadiness(): Promise<Readiness>;
}

let client: MhaiClient | undefined;

/** Plan 1 ships mock mode only. Plan 2 adds the live client behind the BFF. */
export function getClient(): MhaiClient {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") {
    throw new Error(
      "Live API client arrives in Plan 2. Set NEXT_PUBLIC_USE_MOCK=true.",
    );
  }
  return (client ??= createMockClient());
}
```

`lib/api/mock.ts`:

```ts
import type { MhaiClient } from "./client";
import type { QueryCreateIn, Stage } from "./contract";
import { FIXTURES } from "./fixtures";

type Scenario = keyof typeof FIXTURES | "failed";
const ORDER: Stage[] = [
  "pii_masking",
  "retrieval",
  "generation",
  "nli_verification",
  "hga_verification",
  "decision",
];

export function pickScenario(q: QueryCreateIn): Scenario {
  const t = q.clinical_question.toLowerCase();
  if (t.includes("fail")) return "failed";
  if (t.includes("potassium") || t.includes("review")) return "review";
  if (t.includes("fever") || t.includes("dengue")) return "caution";
  return "high";
}

export function createMockClient({
  stepMs = 1500,
  now = () => Date.now(),
}: { stepMs?: number; now?: () => number } = {}): MhaiClient {
  // In memory only: never persisted (CONTRIBUTING: no PHI in browser storage).
  const jobs = new Map<string, { started: number; scenario: Scenario }>();
  let n = 0;
  return {
    async createQuery(q) {
      const id = `mock-${++n}-${Math.random().toString(36).slice(2, 8)}`;
      jobs.set(id, { started: now(), scenario: pickScenario(q) });
      return { query_id: id };
    },
    async getStatus(id) {
      const j = jobs.get(id);
      if (!j) throw new Error("not_found");
      const i = Math.floor((now() - j.started) / stepMs);
      if (j.scenario === "failed" && i >= 3) {
        return {
          query_id: id,
          status: "failed",
          progress: 0.5,
          current_stage: null,
          error_code: "pipeline_timeout",
        };
      }
      if (i >= ORDER.length)
        return {
          query_id: id,
          status: "completed",
          progress: 1,
          current_stage: null,
        };
      return {
        query_id: id,
        status: i === 0 ? "queued" : "processing",
        progress: i / ORDER.length,
        current_stage: ORDER[i],
      };
    },
    async getResult(id) {
      const j = jobs.get(id);
      if (
        !j ||
        j.scenario === "failed" ||
        now() - j.started < stepMs * ORDER.length
      )
        throw new Error("result_not_ready");
      return { ...structuredClone(FIXTURES[j.scenario]), query_id: id };
    },
    async sendFeedback(f) {
      return f.action === "correct"
        ? { status: "pending_review", correction_id: `c-${++n}` }
        : { status: "recorded" };
    },
    async getReadiness() {
      return { ok: true, degraded_services: [] };
    },
  };
}
```

`.env.example`:

```bash
# Plan 1 runs on mock data only.
NEXT_PUBLIC_USE_MOCK=true
```

The first test expects `current_stage` to be `pii_masking` while the
status is `queued`. That is intentional: the step list shows the first
step as active straight away.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run lib/api`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api .env.example
git commit -m "Add the client interface and a mock client with four scenarios"
```

---

### Task 6: Session history, providers and query hooks

**Files:**

- Create: `lib/session-store.tsx`, `lib/queries.ts`, `lib/queries.test.tsx`, `app/providers.tsx`

**Interfaces:**

- Consumes: `getClient`, `MhaiClient` (Task 5); `toResultView` (Task 2).
- Produces:
  - `interface SessionItem { id: string; title: string; urgency: Urgency; createdAt: number; kind?: ResultKind | "failed"; flagged?: boolean; query: QueryCreateIn }`;
  - `<SessionProvider>`;
  - `useSession(): { items: SessionItem[]; add(i: SessionItem): void; update(id: string, p: Partial<SessionItem>): void; get(id: string): SessionItem | undefined; clear(): void }`;
  - `<Providers>`, which wraps QueryClient, Session and Toast;
  - `useSubmitQuery()` returns a mutation that takes a `QueryCreateIn` and resolves to `{ query_id }`, then adds a session item;
  - `useQueryStatus(id: string, opts?: { stallMs?: number })` returns `{ status, progress, stage, stalled, error }` and polls every 2000 ms until `completed`, `failed` or stalled (default 120000 ms with no progress change);
  - `useResult(id: string, enabled: boolean)` returns the TanStack query result for `ClinicalResultOut`;
  - `useFeedback()` returns a mutation for `FeedbackIn`.

- [ ] **Step 1: Write the failing tests**

`lib/queries.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./session-store";

const status = vi.fn();
vi.mock("./api/client", () => ({
  getClient: () => ({
    getStatus: status,
    createQuery: vi.fn(async () => ({ query_id: "q1" })),
  }),
}));
import { useQueryStatus, useSubmitQuery } from "./queries";

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <SessionProvider>{children}</SessionProvider>
  </QueryClientProvider>
);

describe("useQueryStatus", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => {
    vi.useRealTimers();
    status.mockReset();
  });

  it("stops polling once the job fails", async () => {
    status.mockResolvedValue({
      query_id: "q1",
      status: "failed",
      progress: 0.5,
      current_stage: null,
      error_code: "pipeline_timeout",
    });
    const { result } = renderHook(() => useQueryStatus("q1"), {
      wrapper: wrap,
    });
    await waitFor(() => expect(result.current.status).toBe("failed"));
    const calls = status.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(status.mock.calls.length).toBe(calls);
  });

  it("marks a job stalled when progress does not move", async () => {
    status.mockResolvedValue({
      query_id: "q1",
      status: "processing",
      progress: 0.3,
      current_stage: "generation",
    });
    const { result } = renderHook(
      () => useQueryStatus("q1", { stallMs: 5000 }),
      { wrapper: wrap },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7000);
    });
    expect(result.current.stalled).toBe(true);
  });
});

describe("useSubmitQuery", () => {
  it("adds the consultation to the in-memory session, not storage", async () => {
    const { result } = renderHook(
      () => ({ submit: useSubmitQuery(), session: useSession() }),
      { wrapper: wrap },
    );
    await act(() =>
      result.current.submit.mutateAsync({
        patient_data: {
          age: 54,
          sex: "male",
          symptoms: ["Chest pain", "Sweating"],
        },
        clinical_question: "q".repeat(12),
        urgency: "urgent",
      }),
    );
    expect(result.current.session.items[0]).toMatchObject({
      id: "q1",
      title: "Chest pain, 54 M",
      urgency: "urgent",
    });
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run lib/queries.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/session-store.tsx`:

```tsx
"use client";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { QueryCreateIn, Urgency } from "./api/contract";
import type { ResultKind } from "./labels";

export interface SessionItem {
  id: string;
  title: string;
  urgency: Urgency;
  createdAt: number;
  kind?: ResultKind | "failed";
  flagged?: boolean;
  query: QueryCreateIn;
}

type Ctx = {
  items: SessionItem[];
  add(i: SessionItem): void;
  update(id: string, p: Partial<SessionItem>): void;
  get(id: string): SessionItem | undefined;
  clear(): void;
};
const SessionCtx = createContext<Ctx | null>(null);

/** Session-only history: React state, never storage (Build Guide; CONTRIBUTING). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SessionItem[]>([]);
  const add = useCallback(
    (i: SessionItem) => setItems((x) => [i, ...x.filter((y) => y.id !== i.id)]),
    [],
  );
  const update = useCallback(
    (id: string, p: Partial<SessionItem>) =>
      setItems((x) => x.map((y) => (y.id === id ? { ...y, ...p } : y))),
    [],
  );
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(
    () => ({
      items,
      add,
      update,
      clear,
      get: (id: string) => items.find((i) => i.id === id),
    }),
    [items, add, update, clear],
  );
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

export const titleFor = (q: QueryCreateIn) =>
  `${q.patient_data.symptoms[0] ?? "Consultation"}, ${q.patient_data.age} ${({ male: "M", female: "F", other: "X", unknown: "?" } as const)[q.patient_data.sex]}`;
```

`lib/queries.ts`:

```ts
"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getClient } from "./api/client";
import type { FeedbackIn, QueryCreateIn } from "./api/contract";
import { titleFor, useSession } from "./session-store";

export function useSubmitQuery() {
  const session = useSession();
  return useMutation({
    mutationFn: (q: QueryCreateIn) => getClient().createQuery(q),
    onSuccess: ({ query_id }, q) =>
      session.add({
        id: query_id,
        title: titleFor(q),
        urgency: q.urgency,
        createdAt: Date.now(),
        query: q,
      }),
  });
}

export function useQueryStatus(
  id: string,
  { stallMs = 120_000 }: { stallMs?: number } = {},
) {
  const [stalled, setStalled] = useState(false);
  const last = useRef<{ p: number; at: number }>({ p: -1, at: Date.now() });
  const q = useQuery({
    queryKey: ["status", id],
    queryFn: () => getClient().getStatus(id),
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return s === "completed" || s === "failed" || stalled ? false : 2000;
    },
    gcTime: 0,
  });
  const progress = q.data?.progress ?? 0;
  useEffect(() => {
    if (progress !== last.current.p)
      last.current = { p: progress, at: Date.now() };
    const t = setInterval(() => {
      if (
        Date.now() - last.current.at >= stallMs &&
        q.data?.status !== "completed" &&
        q.data?.status !== "failed"
      )
        setStalled(true);
    }, 1000);
    return () => clearInterval(t);
  }, [progress, stallMs, q.data?.status]);
  return {
    status: q.data?.status,
    progress,
    stage: q.data?.current_stage ?? null,
    stalled,
    error: q.error,
  };
}

export function useResult(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["result", id],
    queryFn: () => getClient().getResult(id),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
  });
}

export function useFeedback() {
  return useMutation({
    mutationFn: (f: FeedbackIn) => getClient().sendFeedback(f),
  });
}
```

`app/providers.tsx`:

```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider } from "@/lib/session-store";

export function Providers({ children }: { children: ReactNode }) {
  // Memory-only cache: no persister is ever attached (no PHI in browser storage).
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={qc}>
      <SessionProvider>
        <ToastProvider>{children}</ToastProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
```

Wrap `{children}` in `app/layout.tsx` with `<Providers>`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/session-store.tsx lib/queries.ts lib/queries.test.tsx app/providers.tsx app/layout.tsx
git commit -m "Add in-memory session history and polling query hooks"
```

---

### Task 7: App shell, routes and responsive navigation

Read first: `node_modules/next/dist/docs/01-app/01-getting-started/` (layouts and pages, route groups) and `01-app/03-api-reference/03-file-conventions/not-found.md`.

**Files:**

- Create: `app/(clinical)/layout.tsx`, `app/(clinical)/page.tsx` (temporary content until Task 11), `components/shell/app-shell.tsx`, `sidebar.tsx`, `top-bar.tsx`, `mobile-drawer.tsx`, `group-history.ts`, `group-history.test.ts`, `sidebar.test.tsx`
- Delete: nothing (`app/page.tsx` went in Task 1)

**Interfaces:**

- Consumes: `useSession`, `SessionItem` (Task 6); `Logo`, `Mark`, `PartnerLine` (Task 1); `RESULT_LABEL` (Task 2); `Chip`, `cn` (Task 3).
- Produces:
  - `<AppShell>{children}</AppShell>`;
  - `<TopBar title sub? urgency? actions? />`;
  - `groupHistory(items: SessionItem[], now: number): { label: "Today"|"Yesterday"|"Earlier"; items: SessionItem[] }[]`;
  - `DEMO_USER = { initials: "DR", name: "Dr. Reyes", role: "Attending · Internal Medicine", hospital: "Havana Hospital" }`.

**Breakpoints** (spec §4):

| Width               | Sidebar                                  | Evidence panel                           |
| ------------------- | ---------------------------------------- | ---------------------------------------- |
| `xl` (≥1280 px)     | 256 px                                   | 330 px column                            |
| `lg` (1024–1279 px) | 76 px rail; labels shown as tooltips     | 300 px column                            |
| `md` (768–1023 px)  | Rail                                     | Bottom summary bar plus `Sheet` (Task 9) |
| below `md`          | Hidden; a ☰ button opens `MobileDrawer` | Bottom summary bar plus `Sheet`          |

- [ ] **Step 1: Write the failing tests**

`components/shell/group-history.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupHistory } from "./group-history";

const at = (h: number) => ({
  id: String(h),
  title: "x",
  urgency: "routine" as const,
  createdAt: h,
  query: {} as never,
});
const DAY = 86_400_000;
const now = new Date("2026-10-13T15:00:00").getTime();

describe("groupHistory", () => {
  it("groups by Today, Yesterday, Earlier and drops empty groups", () => {
    const g = groupHistory(
      [at(now - 60_000), at(now - DAY), at(now - 5 * DAY)],
      now,
    );
    expect(g.map((x) => [x.label, x.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 1],
      ["Earlier", 1],
    ]);
    expect(groupHistory([at(now)], now).map((x) => x.label)).toEqual(["Today"]);
  });
});
```

`components/shell/sidebar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/c/q1" }));

const items = [
  {
    id: "q1",
    title: "Chest pain, 54 M",
    urgency: "urgent" as const,
    createdAt: Date.now(),
    kind: "high" as const,
    query: {} as never,
  },
  {
    id: "q2",
    title: "Febrile child, 3 F",
    urgency: "routine" as const,
    createdAt: Date.now(),
    kind: "caution" as const,
    flagged: true,
    query: {} as never,
  },
];

describe("Sidebar", () => {
  it("lists session history with plain-language status and marks the current one", () => {
    render(<Sidebar items={items} />);
    expect(
      screen.getByRole("link", { name: /Chest pain, 54 M/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByText(/High confidence/)).toBeInTheDocument();
    expect(screen.getByLabelText("Flagged")).toBeInTheDocument();
  });
  it("shows the new consultation action, session note and hospital", () => {
    render(<Sidebar items={[]} />);
    expect(
      screen.getByRole("link", { name: /New consultation/ }),
    ).toHaveAttribute("href", "/");
    expect(screen.getByText(/kept for this session only/)).toBeInTheDocument();
    expect(screen.getByText("Havana Hospital")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/shell`. Expected: FAIL.

- [ ] **Step 3: Implement**

`components/shell/group-history.ts`:

```ts
import type { SessionItem } from "@/lib/session-store";

export function groupHistory(items: SessionItem[], now: number) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const today = start.getTime(),
    yesterday = today - 86_400_000;
  const groups = {
    Today: [] as SessionItem[],
    Yesterday: [] as SessionItem[],
    Earlier: [] as SessionItem[],
  };
  for (const i of items)
    (i.createdAt >= today
      ? groups.Today
      : i.createdAt >= yesterday
        ? groups.Yesterday
        : groups.Earlier
    ).push(i);
  return (["Today", "Yesterday", "Earlier"] as const)
    .filter((l) => groups[l].length)
    .map((label) => ({ label, items: groups[label] }));
}
```

`components/shell/sidebar.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MoreHorizontal,
  Plus,
  Search,
  Stethoscope,
  Building2,
} from "lucide-react";
import type { SessionItem } from "@/lib/session-store";
import { RESULT_LABEL } from "@/lib/labels";
import { Logo, Mark } from "../ui/brand";
import { cn } from "../ui/cn";
import { groupHistory } from "./group-history";

export const DEMO_USER = {
  initials: "DR",
  name: "Dr. Reyes",
  role: "Attending · Internal Medicine",
  hospital: "Havana Hospital",
};
const DOT = {
  high: "bg-ok",
  caution: "bg-warn",
  review: "bg-bad",
  failed: "bg-ink-3",
} as const;
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${m} min` : `${Math.round(m / 60)} h`;
};

/** `rail` hides labels (tablet). Labels stay in the accessibility tree via sr-only. */
export function Sidebar({
  items,
  rail = false,
  onOpenSearch,
}: {
  items: SessionItem[];
  rail?: boolean;
  onOpenSearch?: () => void;
}) {
  const path = usePathname();
  const label = rail ? "sr-only" : "";
  return (
    <nav
      aria-label="Consultations"
      className={cn(
        "relative flex h-full flex-col overflow-hidden border-r border-line bg-gradient-to-b from-white to-[#fbf8fc] py-[18px]",
        rail ? "items-center px-3" : "px-3.5",
      )}
    >
      <div className={cn("pb-4", rail ? "" : "px-1.5")}>
        {rail ? (
          <Mark />
        ) : (
          <>
            <Logo />
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3">
              <span className="relative size-[7px] rounded-full bg-mint after:absolute after:-inset-[3px] after:animate-[ring_2.4s_ease-out_infinite] after:rounded-full after:border-[1.5px] after:border-mint" />
              Clinical decision support
            </p>
          </>
        )}
      </div>
      <Link
        href="/"
        title="New consultation"
        className={cn(
          "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-mint font-semibold text-white shadow-[0_10px_24px_-10px_var(--color-mint)]",
          rail ? "size-11" : "px-3",
        )}
      >
        <Plus aria-hidden className="size-5" />
        <span className={label}>New consultation</span>
      </Link>
      <button
        type="button"
        onClick={onOpenSearch}
        title="Search consultations (⌘K)"
        className={cn(
          "mt-2.5 flex min-h-10 items-center gap-2 rounded-[10px] border border-line bg-bg text-[13px] text-ink-3",
          rail ? "w-11 justify-center" : "px-2.5",
        )}
      >
        <Search aria-hidden className="size-4" />
        <span className={label}>Search consultations</span>
        {!rail && (
          <kbd className="ml-auto rounded border border-lilac-2 px-1.5 font-mono text-[10.5px]">
            ⌘K
          </kbd>
        )}
      </button>
      <div className="mt-2 flex-1 overflow-y-auto">
        {groupHistory(items, Date.now()).map((g) => (
          <section key={g.label} aria-label={g.label}>
            <h3
              className={cn(
                "mx-2 mb-1.5 mt-[18px] text-[10.5px] uppercase tracking-[.1em] text-ink-3",
                rail && "sr-only",
              )}
            >
              {g.label}
            </h3>
            {g.items.map((i) => {
              const on = path === `/c/${i.id}`;
              return (
                <Link
                  key={i.id}
                  href={`/c/${i.id}`}
                  title={i.title}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-[10px] p-2 text-[13px] leading-tight hover:bg-bg",
                    on &&
                      "bg-mint-wash shadow-[inset_3px_0_0_var(--color-mint)]",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-lg bg-lilac text-bloom",
                      on && "bg-white text-mint-deep",
                      rail && "size-[38px]",
                    )}
                  >
                    <Stethoscope className="size-3.5" />
                  </span>
                  <span className={label}>
                    {i.title}
                    {i.flagged && (
                      <span
                        aria-label="Flagged"
                        className="ml-1.5 inline-block size-[7px] rounded-full bg-[#f0a640]"
                      />
                    )}
                    <small className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                      {i.kind && (
                        <span
                          aria-hidden
                          className={cn("size-[7px] rounded-full", DOT[i.kind])}
                        />
                      )}
                      {i.kind ? RESULT_LABEL[i.kind] : "Analysing"} ·{" "}
                      {ago(i.createdAt)}
                    </small>
                  </span>
                </Link>
              );
            })}
          </section>
        ))}
        <p
          className={cn(
            "px-2 pt-2 text-[10.5px] text-ink-3",
            rail && "sr-only",
          )}
        >
          History is kept for this session only.
        </p>
      </div>
      <div
        className={cn(
          "flex items-center gap-2.5 border-t border-line pt-2.5 text-[13px]",
          rail ? "justify-center" : "px-1.5",
        )}
        title={`${DEMO_USER.name} · ${DEMO_USER.role} · ${DEMO_USER.hospital}`}
      >
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orchid to-[#6e3c6a] text-xs font-bold text-white"
        >
          {DEMO_USER.initials}
        </span>
        <span className={label}>
          {DEMO_USER.name}
          <small className="block text-[11px] text-ink-3">
            {DEMO_USER.role}
          </small>
          <small className="flex items-center gap-1 text-[11px] font-medium text-mint-deep">
            <Building2 aria-hidden className="size-3" />
            {DEMO_USER.hospital}
          </small>
        </span>
        {!rail && (
          <MoreHorizontal aria-hidden className="ml-auto size-4 text-ink-3" />
        )}
      </div>
    </nav>
  );
}
```

Add this to `app/globals.css`:

```css
@keyframes ring {
  0% {
    opacity: 0.7;
    transform: scale(0.92);
  }
  100% {
    opacity: 0;
    transform: scale(1.35);
  }
}
```

`components/shell/top-bar.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Urgency } from "@/lib/api/contract";
import { cn } from "../ui/cn";

const URG = {
  routine: "bg-mint-wash text-mint-deep",
  urgent: "bg-warn-wash text-warn-deep",
  emergency: "bg-bad-wash text-bad-deep",
} as const;

export function TopBar({
  title,
  sub,
  urgency,
  actions,
  leading,
}: {
  title: string;
  sub?: string;
  urgency?: Urgency;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  return (
    <header className="relative flex items-center gap-3 border-b border-white/70 px-4 py-3.5 md:px-[26px] md:py-4">
      {leading}
      <div className="min-w-0">
        <h1 className="truncate text-base font-semibold">{title}</h1>
        {sub && <p className="font-mono text-xs text-ink-3">{sub}</p>}
      </div>
      {urgency && (
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[.06em]",
            URG[urgency],
          )}
        >
          {urgency}
        </span>
      )}
      <div className="ml-auto flex gap-2">{actions}</div>
    </header>
  );
}
```

`components/shell/mobile-drawer.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import type { SessionItem } from "@/lib/session-store";
import { cn } from "../ui/cn";
import { Sidebar } from "./sidebar";

export function MobileDrawer({
  open,
  onClose,
  items,
  onOpenSearch,
}: {
  open: boolean;
  onClose(): void;
  items: SessionItem[];
  onOpenSearch(): void;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <div
      className={cn(
        "fixed inset-0 z-40 md:hidden",
        !open && "pointer-events-none",
      )}
      aria-hidden={!open}
    >
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/35 transition-opacity duration-[var(--t-base)]",
          open ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onClick={(e) => (e.target as HTMLElement).closest("a") && onClose()}
        className={cn(
          "absolute inset-y-0 left-0 w-[84%] max-w-80 transition-transform duration-[var(--t-slow)] ease-[var(--e-out)]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar items={items} onOpenSearch={onOpenSearch} />
      </div>
    </div>
  );
}
```

`components/shell/app-shell.tsx`. It owns the search and drawer state and
exposes them through context. Tasks 11 and 12 add the palette, the
shortcuts and the session timeout here.

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useSession } from "@/lib/session-store";
import { MobileDrawer } from "./mobile-drawer";
import { Sidebar } from "./sidebar";

type ShellCtx = {
  openDrawer(): void;
  openSearch(): void;
  searchOpen: boolean;
  closeSearch(): void;
};
const Ctx = createContext<ShellCtx>({
  openDrawer() {},
  openSearch() {},
  searchOpen: false,
  closeSearch() {},
});
export const useShell = () => useContext(Ctx);

export function AppShell({ children }: { children: ReactNode }) {
  const { items } = useSession();
  const [drawer, setDrawer] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const ctx: ShellCtx = {
    openDrawer: () => setDrawer(true),
    openSearch: () => setSearchOpen(true),
    searchOpen,
    closeSearch: () => setSearchOpen(false),
  };
  return (
    <Ctx.Provider value={ctx}>
      <div className="grid h-dvh grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)]">
        <div className="hidden md:block xl:hidden">
          <Sidebar items={items} rail onOpenSearch={ctx.openSearch} />
        </div>
        <div className="hidden xl:block">
          <Sidebar items={items} onOpenSearch={ctx.openSearch} />
        </div>
        <main className="canvas-v3 relative flex min-w-0 flex-col overflow-hidden">
          {children}
        </main>
      </div>
      <MobileDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        items={items}
        onOpenSearch={ctx.openSearch}
      />
    </Ctx.Provider>
  );
}
```

`app/(clinical)/layout.tsx`:

```tsx
import { AppShell } from "@/components/shell/app-shell";

export default function ClinicalLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
```

`app/(clinical)/page.tsx` is temporary. Task 11 replaces it with the
first-visit and form logic.

```tsx
import { TopBar } from "@/components/shell/top-bar";

export default function Home() {
  return <TopBar title="New consultation" sub="Draft · not submitted" />;
}
```

- [ ] **Step 4: Run the tests, then check by eye**

Run: `npx vitest run components/shell && npm run typecheck`. Expected: PASS.

Then run `NEXT_PUBLIC_USE_MOCK=true npm run dev` and resize the browser
to 1440, 1100, 820 and 390 px. Check each width matches the sidebar column
of the breakpoint table.

- [ ] **Step 5: Commit**

```bash
git add app components/shell
git commit -m "Add the app shell with sidebar, rail and mobile drawer"
```

---

### Task 8: Analysing view

**Files:**

- Create: `components/processing/ecg-line.tsx`, `stage-list.tsx`, `processing-view.tsx`, `processing-view.test.tsx`

**Interfaces:**

- Consumes: `STAGES` (Task 2); `Stage`, `QueryStatusOut["status"]` (Task 2).
- Produces: `<ProcessingView stage: Stage | null; progress: number; elapsedMs: number />`.

**Rule:** don't show per-stage timings. The API doesn't give them (spec §10,
item 12), so the view shows total elapsed time only.

- [ ] **Step 1: Write the failing test**

`components/processing/processing-view.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProcessingView } from "./processing-view";

describe("ProcessingView", () => {
  it("marks earlier steps done, the current one active, and later ones to do", () => {
    render(
      <ProcessingView stage="generation" progress={2 / 6} elapsedMs={4200} />,
    );
    const steps = screen.getAllByRole("listitem");
    expect(steps.map((s) => s.getAttribute("data-state"))).toEqual([
      "done",
      "done",
      "active",
      "todo",
      "todo",
      "todo",
    ]);
    expect(steps[2]).toHaveAttribute("aria-current", "step");
  });
  it("shows step count, percent from the API, and elapsed time only", () => {
    render(
      <ProcessingView stage="generation" progress={0.58} elapsedMs={4200} />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "58",
    );
    expect(screen.getByText("Step 3 of 6")).toBeInTheDocument();
    expect(screen.getByText("4.2 s")).toBeInTheDocument();
  });
  it("treats a null stage before start as the first step", () => {
    render(<ProcessingView stage={null} progress={0} elapsedMs={0} />);
    expect(screen.getAllByRole("listitem")[0]).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run components/processing`. Expected: FAIL.

- [ ] **Step 3: Implement**

`components/processing/ecg-line.tsx`:

```tsx
export function EcgLine() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 70"
      className="mx-auto h-[70px] w-full max-w-[300px]"
    >
      <path
        d="M0 35h70l10-20 14 40 12-52 14 60 10-28h170"
        className="fill-none stroke-mint-2 opacity-20 blur-[3px] [stroke-width:8]"
      />
      <path
        d="M0 35h70l10-20 14 40 12-52 14 60 10-28h170"
        className="fill-none stroke-mint [stroke-dasharray:420] [stroke-linecap:round] [stroke-width:2.6] motion-safe:animate-[ecg_2.2s_linear_infinite]"
      />
    </svg>
  );
}
```

Add this to `app/globals.css`:

```css
@keyframes ecg {
  from {
    stroke-dashoffset: 420;
  }
  to {
    stroke-dashoffset: 0;
  }
}
```

`components/processing/stage-list.tsx`:

```tsx
import { Check } from "lucide-react";
import type { Stage } from "@/lib/api/contract";
import { STAGES } from "@/lib/labels";
import { cn } from "../ui/cn";

export function StageList({ stage }: { stage: Stage | null }) {
  const current = Math.max(
    0,
    STAGES.findIndex((s) => s.id === stage),
  );
  return (
    <ol className="flex flex-col gap-1.5 text-left">
      {STAGES.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            key={s.id}
            data-state={state}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-sm transition-colors duration-[var(--t-base)]",
              state === "done" &&
                "border-transparent bg-mint-wash text-mint-deep",
              state === "active" &&
                "border-mint bg-white font-semibold shadow-[0_0_0_4px_#15999e1a]",
              state === "todo" && "border-line bg-white text-ink-3",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-transform duration-[var(--t-base)] ease-[var(--e-spring)]",
                state === "done"
                  ? "scale-105 border-mint bg-mint text-white"
                  : state === "active"
                    ? "border-mint"
                    : "border-lilac-2",
              )}
            >
              {state === "done" && (
                <Check className="size-3.5" strokeWidth={3} />
              )}
              {state === "active" && (
                <span className="size-2 rounded-full bg-mint motion-safe:animate-[pulse-dot_1.2s_ease-in-out_infinite]" />
              )}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
```

Add this to `app/globals.css`:

```css
@keyframes pulse-dot {
  50% {
    transform: scale(1.6);
    opacity: 0.4;
  }
}
```

`components/processing/processing-view.tsx`:

```tsx
import type { Stage } from "@/lib/api/contract";
import { STAGES } from "@/lib/labels";
import { EcgLine } from "./ecg-line";
import { StageList } from "./stage-list";

export function ProcessingView({
  stage,
  progress,
  elapsedMs,
}: {
  stage: Stage | null;
  progress: number;
  elapsedMs: number;
}) {
  const pct = Math.round(progress * 100);
  const step =
    Math.max(
      0,
      STAGES.findIndex((s) => s.id === stage),
    ) + 1;
  return (
    <section
      aria-live="polite"
      className="card-v3 mx-auto mt-5 max-w-[540px] p-6 text-center"
    >
      <EcgLine />
      <h2 className="font-display text-[34px] font-black leading-none">
        Analysing your question
      </h2>
      <p className="mb-[18px] mt-1 text-ink-2">
        Running clinical safety checks. This usually takes 10–20 seconds.
      </p>
      <StageList stage={stage} />
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-[18px] h-1.5 overflow-hidden rounded-full bg-lilac"
      >
        <i
          className="block h-full rounded-full bg-gradient-to-r from-mint to-mint-2 transition-[width] duration-[var(--t-slow)] ease-[var(--e-out)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-3">
        <span>
          Step {step} of {STAGES.length}
        </span>
        <span className="font-mono tabular">
          {(elapsedMs / 1000).toFixed(1)} s
        </span>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/processing`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/processing app/globals.css
git commit -m "Add the analysing view with live steps and progress"
```

---

### Task 9: Result view and the evidence panel (including the mobile sheet)

**Files:**

- Create: `components/result/result-banner.tsx`, `citation-tag.tsx`, `result-card.tsx`, `result-card.test.tsx`, `parse-body.ts`, `parse-body.test.ts`; `components/evidence/evidence-panel.tsx`, `evidence-dock.tsx`, `evidence-panel.test.tsx`; `lib/highlight.tsx`

**Interfaces:**

- Consumes: `ResultView` and `toResultView` (Task 2); `ClinicalResultOut`, `Citation` (Task 2); `ConfidencePill`, `Chip`, `Banner`, `Sheet`, `Button`, `useToast` (Task 3).
- Produces:
  - `parseBody(text: string, citations: Citation[]): { summary: string; steps: { text: string; citation?: Citation }[] }`;
  - `<HighlightProvider>`, `useHighlight(): { source: string | null; set(s: string | null): void }`;
  - `<ResultCard view: ResultView; parsed: ReturnType<typeof parseBody>; actions?: ReactNode; feedback?: ReactNode />`;
  - `<EvidencePanel view: ResultView />`;
  - `<EvidenceDock view: ResultView />`, which below `lg` shows a summary bar that opens a `Sheet` with the tabs Checks, Why this confidence and Sources.

**Body format:** the first paragraph is the summary. Lines starting with
`- ` are next steps. A trailing `[n]` marker links a step to `citations[n-1]`.
If there are no bullets, the whole text is the summary.

- [ ] **Step 1: Write the failing tests**

`components/result/parse-body.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseBody } from "./parse-body";

const cite = (t: string) => ({
  chunk_id: t,
  source_title: t,
  excerpt: "",
  claim_text: "",
  nli_label: "ENTAILMENT" as const,
  nli_confidence: 1,
  action: "PASS" as const,
  reason: "",
});

describe("parseBody", () => {
  it("splits summary and cited steps", () => {
    const r = parseBody("Summary line.\n- Step one [1]\n- Step two", [
      cite("A"),
    ]);
    expect(r.summary).toBe("Summary line.");
    expect(r.steps).toEqual([
      { text: "Step one", citation: cite("A") },
      { text: "Step two" },
    ]);
  });
  it("ignores markers that point past the citation list", () => {
    expect(parseBody("- Step [7]", []).steps).toEqual([{ text: "Step" }]);
  });
  it("handles empty text", () => {
    expect(parseBody("", [])).toEqual({ summary: "", steps: [] });
  });
});
```

`components/result/result-card.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { HighlightProvider } from "@/lib/highlight";
import { parseBody } from "./parse-body";
import { ResultCard } from "./result-card";

const renderFor = (
  r: typeof FIXTURES.high | typeof FIXTURES.caution | typeof FIXTURES.review,
) =>
  render(
    <HighlightProvider>
      <ResultCard
        view={toResultView(r)}
        parsed={parseBody(r.response_text, r.citations)}
      />
    </HighlightProvider>,
  );

describe("ResultCard", () => {
  it("high: pill, diagnosis, ICD chip, cited steps, time and disclaimer", () => {
    renderFor(FIXTURES.high);
    expect(
      screen.getByRole("status", { name: /High confidence/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Unstable angina" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /ICD-10 I20.0/ }),
    ).toHaveAttribute(
      "title",
      "ICD-10 diagnosis code: Unstable angina. Click to copy.",
    );
    expect(screen.getAllByText(/Verified/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Completed in 11.8 s/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Final clinical judgement rests with the treating clinician/,
      ),
    ).toBeInTheDocument();
  });
  it("review: red banner, no confidence pill, 'possible assessment', removed claim struck through", () => {
    renderFor(FIXTURES.review);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "This result needs clinician review before any clinical action is taken",
    );
    expect(screen.queryByRole("status", { name: /confidence/i })).toBeNull();
    expect(
      screen.getByText(/Possible assessment · not verified/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/IV potassium 40 mmol/).closest("s"),
    ).not.toBeNull();
    expect(screen.getByText(/reduced-accuracy mode/)).toBeInTheDocument();
  });
  it("hides the ICD chip when the code is null", () => {
    renderFor({ ...FIXTURES.high, icd10_code: null });
    expect(screen.queryByRole("button", { name: /ICD-10/ })).toBeNull();
  });
  it("never shows backend terms", () => {
    const { container } = renderFor(FIXTURES.caution);
    expect(container.textContent).not.toMatch(
      /trust score|NLI|entropy|REGENERATE|ESCALATE|\bPASS\b/,
    );
  });
});
```

`components/evidence/evidence-panel.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { HighlightProvider } from "@/lib/highlight";
import { EvidencePanel } from "./evidence-panel";

describe("EvidencePanel", () => {
  it("shows safety checks with counts, only measures the API returned, and grouped sources", () => {
    render(
      <HighlightProvider>
        <EvidencePanel view={toResultView(FIXTURES.high)} />
      </HighlightProvider>,
    );
    expect(screen.getByText("Patient data protected")).toBeInTheDocument();
    expect(screen.getByText("4 of 4 claims verified")).toBeInTheDocument();
    expect(screen.getByText("Evidence match")).toBeInTheDocument();
    expect(screen.queryByText("Answer stability")).toBeNull();
    expect(
      screen.getByText("AHA 2021 Chest Pain Guideline"),
    ).toBeInTheDocument();
    expect(screen.getByText("Used 2 times")).toBeInTheDocument();
  });
  it("warns when some claims need review", () => {
    render(
      <HighlightProvider>
        <EvidencePanel view={toResultView(FIXTURES.caution)} />
      </HighlightProvider>,
    );
    expect(
      screen.getByText("1 recommendation needs review"),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/result components/evidence`. Expected: FAIL.

- [ ] **Step 3: Implement the body parser and the highlight context**

`components/result/parse-body.ts`:

```ts
import type { Citation } from "@/lib/api/contract";

export function parseBody(text: string, citations: Citation[]) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const summary = lines.filter((l) => !l.startsWith("- ")).join(" ");
  const steps = lines
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const m = l.slice(2).match(/^(.*?)\s*\[(\d+)\]\s*$/);
      const t = m ? m[1] : l.slice(2);
      const c = m ? citations[Number(m[2]) - 1] : undefined;
      return c ? { text: t, citation: c } : { text: t };
    });
  return { summary, steps };
}
```

`lib/highlight.tsx` (links hovering a source tag to its source card):

```tsx
"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

const Ctx = createContext<{
  source: string | null;
  set(s: string | null): void;
}>({ source: null, set() {} });
export const useHighlight = () => useContext(Ctx);
export function HighlightProvider({ children }: { children: ReactNode }) {
  const [source, set] = useState<string | null>(null);
  return <Ctx.Provider value={{ source, set }}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Implement the result components**

`components/result/citation-tag.tsx`:

```tsx
"use client";
import { Check, Info, X } from "lucide-react";
import type { Citation } from "@/lib/api/contract";
import { citationTag } from "@/lib/labels";
import { useHighlight } from "@/lib/highlight";
import { cn } from "../ui/cn";

const TONE = {
  ok: "bg-ok-wash text-ok-deep",
  warn: "bg-warn-wash text-warn-deep",
  bad: "bg-bad-wash text-bad-deep",
} as const;
const ICON = { ok: Check, warn: Info, bad: X } as const;

export function CitationTag({ c }: { c: Citation }) {
  const { source, set } = useHighlight();
  const t = citationTag(c.action);
  const Icon = ICON[t.tone];
  const name = c.action === "PASS" ? c.source_title : t.label;
  return (
    <button
      type="button"
      onMouseEnter={() => set(c.source_title)}
      onMouseLeave={() => set(null)}
      onFocus={() => set(c.source_title)}
      onBlur={() => set(null)}
      className={cn(
        "ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-[7px] px-2 py-0.5 align-middle text-[11px] font-medium transition-shadow duration-[var(--t-fast)]",
        TONE[t.tone],
        source === c.source_title && "ring-2 ring-mint",
      )}
    >
      <Icon aria-hidden className="size-3" />
      {c.action === "PASS" ? `${t.label}: ${name}` : name}
    </button>
  );
}
```

`components/result/result-banner.tsx`:

```tsx
import type { ResultView } from "@/lib/result-view";
import { Banner } from "../ui/banner";

export function ResultBanner({ view }: { view: ResultView }) {
  if (!view.banner) return null;
  const body =
    view.banner.tone === "bad"
      ? "The evidence didn't support enough of this answer for the system to stand behind it."
      : `${view.claims.total - view.claims.verified} recommendation${view.claims.total - view.claims.verified === 1 ? "" : "s"} couldn't be matched to a guideline. Check before acting.`;
  return (
    <div className="mb-3.5">
      <Banner tone={view.banner.tone} title={view.banner.title}>
        {body}
      </Banner>
    </div>
  );
}
```

`components/result/result-card.tsx`:

```tsx
"use client";
import type { ReactNode } from "react";
import { Copy } from "lucide-react";
import type { ResultView } from "@/lib/result-view";
import { Banner } from "../ui/banner";
import { ConfidencePill } from "../ui/confidence-pill";
import { useToast } from "../ui/toast";
import { CitationTag } from "./citation-tag";
import type { parseBody } from "./parse-body";
import { ResultBanner } from "./result-banner";

export function ResultCard({
  view,
  parsed,
  actions,
  feedback,
}: {
  view: ResultView;
  parsed: ReturnType<typeof parseBody>;
  actions?: ReactNode;
  feedback?: ReactNode;
}) {
  const toast = useToast();
  const review = view.kind === "review";
  return (
    <div className="mx-auto max-w-[700px] motion-safe:[&>*]:animate-[fadeUp_var(--t-slow)_var(--e-out)_both]">
      <ResultBanner view={view} />
      {view.reducedAccuracy && (
        <div className="mb-3.5">
          <Banner tone="info" title="Reduced-accuracy mode">
            Evidence checking is running in reduced-accuracy mode.
          </Banner>
        </div>
      )}
      <article
        className="card-v3 px-5 py-6 md:px-[26px]"
        style={{ animationDelay: "80ms" }}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {review && (
            <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-bad">
              Possible assessment · not verified
            </span>
          )}
          {view.icd10 && (
            <button
              type="button"
              title={`ICD-10 diagnosis code: ${view.title}. Click to copy.`}
              aria-label={`ICD-10 ${view.icd10}, copy`}
              onClick={() => {
                void navigator.clipboard?.writeText(view.icd10!);
                toast.show({ title: "ICD-10 code copied", ms: 1800 });
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-lilac px-2.5 py-1 font-mono text-[11px] text-bloom"
            >
              ICD-10 · {view.icd10}
              <Copy aria-hidden className="size-3 opacity-60" />
            </button>
          )}
          {view.confidence && (
            <span className="ml-auto">
              <ConfidencePill {...view.confidence} />
            </span>
          )}
        </div>
        <h2
          className={`mb-2 mt-2.5 font-display text-[38px] font-black leading-[.95] ${review ? "text-ink-2" : ""}`}
        >
          {view.title}
        </h2>
        {parsed.summary && (
          <p className="text-[14.5px] leading-[1.75] text-ink-2">
            {parsed.summary}
          </p>
        )}
        {parsed.steps.length > 0 && (
          <section className="mt-[18px]">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[.08em] text-ink-3">
              Recommended next steps
            </h3>
            <ul className="list-disc space-y-1 pl-[18px] text-[14.5px] leading-[1.75] text-ink-2">
              {parsed.steps.map((s) => (
                <li key={s.text}>
                  {s.citation?.action === "REDACT" ? (
                    <s className="decoration-bad">{s.text}</s>
                  ) : (
                    s.text
                  )}
                  {s.citation && <CitationTag c={s.citation} />}
                </li>
              ))}
            </ul>
          </section>
        )}
        {actions && (
          <div className="mt-[22px] flex flex-wrap items-center gap-2 border-t border-line pt-[18px]">
            {actions}
          </div>
        )}
        {feedback}
        <p className="mt-3 flex gap-3.5 font-mono text-[11.5px] text-ink-3">
          <span>Completed in {view.seconds} s</span>
          <span>{view.sources.length} sources</span>
        </p>
      </article>
      <p className="mt-4 text-center text-[11.5px] text-ink-3">
        Decision support only. Final clinical judgement rests with the treating
        clinician.
        {review &&
          " No confidence level is shown for results that need review."}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Implement the evidence panel and dock**

`components/evidence/evidence-panel.tsx`:

```tsx
"use client";
import { AlertTriangle, Check, ShieldCheck, X } from "lucide-react";
import type { ResultView } from "@/lib/result-view";
import { useHighlight } from "@/lib/highlight";
import { cn } from "../ui/cn";

function Ci({ tone }: { tone: "ok" | "warn" | "bad" }) {
  const I = tone === "ok" ? Check : tone === "warn" ? AlertTriangle : X;
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-[7px]",
        tone === "ok"
          ? "bg-ok-wash text-ok"
          : tone === "warn"
            ? "bg-warn-wash text-warn"
            : "bg-bad-wash text-bad",
      )}
    >
      <I className="size-3" />
    </span>
  );
}

export function SafetyChecks({ view }: { view: ResultView }) {
  const { verified, total } = view.claims;
  const tone =
    total === 0 || verified === total
      ? "ok"
      : verified / total >= 0.5
        ? "warn"
        : "bad";
  const open = total - verified;
  return (
    <section aria-label="Safety checks">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">
        Safety checks
      </h3>
      <p className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <Ci tone="ok" />
        Patient data protected
      </p>
      <p className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <Ci tone={view.kind === "review" ? "warn" : "ok"} />
        Consistent reasoning
      </p>
      <p className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <Ci tone={tone} />
        <span>
          Evidence-backed claims
          <small className="block text-[11.5px] text-ink-3">
            {verified} of {total} claims verified
          </small>
        </span>
      </p>
      {open > 0 && view.kind === "caution" && (
        <p className="mt-1.5 rounded-xl border border-warn-line bg-warn-wash px-3 py-2.5 text-[12.5px] font-semibold text-warn-deep">
          {open} recommendation{open === 1 ? "" : "s"} needs review
        </p>
      )}
    </section>
  );
}

export function ConfidenceBars({ view }: { view: ResultView }) {
  if (!view.measures.length) return null;
  return (
    <section aria-label="Why this confidence">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">
        Why this confidence
      </h3>
      {view.measures.map((m) => {
        const pct = Math.round(m.value * 100);
        return (
          <div key={m.label} className="my-2.5">
            <div className="mb-1 flex justify-between text-[12.5px] text-ink-2">
              <span>{m.label}</span>
              <span className="font-mono tabular">{pct}%</span>
            </div>
            <div
              role="meter"
              aria-label={m.label}
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-[7px] overflow-hidden rounded-full bg-lilac"
            >
              <i
                className={cn(
                  "block h-full rounded-full motion-safe:animate-[grow_var(--t-story)_var(--e-out)_both]",
                  pct >= 75
                    ? "bg-gradient-to-r from-mint to-mint-2"
                    : "bg-gradient-to-r from-warn to-[#d4983c]",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function SourceCards({ view }: { view: ResultView }) {
  const { source } = useHighlight();
  if (!view.sources.length)
    return (
      <p className="text-[12.5px] text-ink-3">
        No sources were used for this answer.
      </p>
    );
  const BADGE = {
    verified: ["Verified", "bg-ok-wash text-ok-deep"],
    review: ["Needs review", "bg-warn-wash text-warn-deep"],
    removed: ["Removed", "bg-bad-wash text-bad-deep"],
  } as const;
  return (
    <section aria-label="Sources used">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">
        Sources used
      </h3>
      {view.sources.map((s) => (
        <div
          key={s.title}
          className={cn(
            "mb-2 rounded-[14px] border bg-white px-3 py-2.5 text-[12.5px] leading-snug transition-[border-color,box-shadow,transform] duration-[var(--t-base)] ease-[var(--e-spring)]",
            source === s.title
              ? "-translate-x-1 border-mint shadow-[0_0_0_3px_#15999e1f]"
              : "border-line",
          )}
        >
          <div className="flex items-center justify-between gap-2 font-semibold">
            {s.title}
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10.5px]",
                BADGE[s.status][1],
              )}
            >
              {BADGE[s.status][0]}
            </span>
          </div>
          {s.excerpt && (
            <q className="my-1.5 block italic text-ink-2">{s.excerpt}</q>
          )}
          <small className="text-[11px] text-ink-3">
            Used {s.uses} {s.uses === 1 ? "time" : "times"}
          </small>
        </div>
      ))}
    </section>
  );
}

export function EvidencePanel({ view }: { view: ResultView }) {
  return (
    <div className="flex flex-col gap-[18px]">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
        <span
          className={cn(
            "grid size-[30px] place-items-center rounded-[9px]",
            view.kind === "review"
              ? "bg-bad-wash text-bad"
              : view.kind === "caution"
                ? "bg-warn-wash text-warn"
                : "bg-mint-wash text-mint-deep",
          )}
        >
          <ShieldCheck aria-hidden className="size-4" />
        </span>
        Evidence &amp; safety
      </h2>
      <SafetyChecks view={view} />
      <ConfidenceBars view={view} />
      <SourceCards view={view} />
    </div>
  );
}
```

Add this to `app/globals.css`:

```css
@keyframes grow {
  from {
    width: 0;
  }
}
```

`components/evidence/evidence-dock.tsx` (the side column at `lg` and up;
below that, a summary bar plus a sheet):

```tsx
"use client";
import { useState } from "react";
import type { ResultView } from "@/lib/result-view";
import { Sheet } from "../ui/sheet";
import { cn } from "../ui/cn";
import {
  ConfidenceBars,
  EvidencePanel,
  SafetyChecks,
  SourceCards,
} from "./evidence-panel";

const TABS = ["Checks", "Why this confidence", "Sources"] as const;

export function EvidenceDock({
  view,
  open = true,
}: {
  view: ResultView;
  open?: boolean;
}) {
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Checks");
  const ok = view.claims.verified === view.claims.total;
  return (
    <>
      <aside
        aria-label="Evidence and safety"
        className={cn(
          "hidden overflow-auto border-l border-line bg-white/95 p-5 lg:block",
          !open && "lg:hidden",
        )}
      >
        <EvidencePanel view={view} />
      </aside>
      <button
        type="button"
        onClick={() => setSheet(true)}
        className="fixed inset-x-4 bottom-[88px] z-20 flex items-center gap-3 rounded-[18px] border border-line bg-white/95 px-3.5 py-3 text-left text-[13px] shadow-[0_24px_50px_-28px_rgb(70_3_81/.4)] backdrop-blur md:bottom-5 lg:hidden"
      >
        <span
          className={cn(
            "grid size-[26px] place-items-center rounded-lg",
            ok ? "bg-ok-wash text-ok" : "bg-warn-wash text-warn",
          )}
        >
          {ok ? "✓" : "!"}
        </span>
        <span>
          <b>Evidence &amp; safety</b>
          <small className="block text-xs text-ink-3">
            {view.claims.verified} of {view.claims.total} claims verified ·{" "}
            {view.sources.length} sources
          </small>
        </span>
        <span className="ml-auto font-semibold text-mint-deep">View ↑</span>
      </button>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Evidence and safety"
      >
        <div role="tablist" className="mb-3 flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px]",
                tab === t ? "bg-ink text-white" : "bg-lilac text-ink-2",
              )}
            >
              {t}
              {t === "Sources" && ` · ${view.sources.length}`}
            </button>
          ))}
        </div>
        {tab === "Checks" && <SafetyChecks view={view} />}
        {tab === "Why this confidence" && <ConfidenceBars view={view} />}
        {tab === "Sources" && <SourceCards view={view} />}
      </Sheet>
    </>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run components/result components/evidence`. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/result components/evidence lib/highlight.tsx app/globals.css
git commit -m "Add the result card, evidence panel and mobile evidence sheet"
```

---

### Task 10: Feedback, export and print

**Files:**

- Create: `components/feedback/feedback-bar.tsx`, `correction-form.tsx`, `export-menu.tsx`, `result-text.ts`, `result-text.test.ts`, `feedback-bar.test.tsx`; `app/print/[id]/page.tsx` (outside `(clinical)`, so it has no shell), `components/print/print-sheet.tsx`

**Interfaces:**

- Consumes: `useFeedback` (Task 6); `correctionSchema` (Task 4); `ResultView`, `parseBody` (Tasks 2 and 9); `Button`, `Banner`, `useToast` (Task 3); `useSession` (Task 6); `useResult` (Task 6); `DEMO_USER` (Task 7).
- Produces:
  - `<FeedbackBar queryId view onDone?(kind: "agree"|"correct"): void />`, which renders the action buttons, the inline correction form and the done state;
  - `resultAsText(view: ResultView, parsed): string`;
  - `<ExportMenu queryId view parsed />`;
  - the `/print/[id]` route.

**Rules:**

- After any feedback, both buttons disable, so it can't be sent twice.
- A Needs review result labels the agree button "Mark as reviewed".
- Exports include the sources and the disclaimer. A review result also
  carries its banner text.
- Print includes only what the clinician typed plus the result: no names
  or ids are added.

- [ ] **Step 1: Write the failing tests**

`components/feedback/result-text.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { parseBody } from "../result/parse-body";
import { resultAsText } from "./result-text";

describe("resultAsText", () => {
  it("includes diagnosis, confidence, steps with numbered sources and the disclaimer", () => {
    const r = FIXTURES.high;
    const t = resultAsText(
      toResultView(r),
      parseBody(r.response_text, r.citations),
    );
    expect(t).toContain("Unstable angina (ICD-10 I20.0)");
    expect(t).toContain("High confidence");
    expect(t).toMatch(/1\. 12-lead ECG within 10 minutes of arrival \[1\]/);
    expect(t).toContain("[1] AHA 2021 Chest Pain Guideline");
    expect(t).toContain("Decision support only.");
  });
  it("carries the review banner on a needs-review result and no confidence", () => {
    const r = FIXTURES.review;
    const t = resultAsText(
      toResultView(r),
      parseBody(r.response_text, r.citations),
    );
    expect(t).toContain("NEEDS CLINICIAN REVIEW");
    expect(t).not.toContain("confidence");
    expect(t).toContain("[removed by safety checks]");
  });
});
```

`components/feedback/feedback-bar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/api/fixtures";
import { toResultView } from "@/lib/result-view";
import { ToastProvider } from "../ui/toast";

const send = vi.fn(async (f: { action: string }) =>
  f.action === "correct"
    ? { status: "pending_review" }
    : { status: "recorded" },
);
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ sendFeedback: send }),
}));
import { FeedbackBar } from "./feedback-bar";

const ui = (r = FIXTURES.high) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <FeedbackBar queryId="q1" view={toResultView(r)} />
      </ToastProvider>
    </QueryClientProvider>,
  );

describe("FeedbackBar", () => {
  it("records agreement once, then disables both actions", async () => {
    ui();
    await userEvent.click(screen.getByRole("button", { name: /I agree/ }));
    expect(send).toHaveBeenCalledWith({ query_id: "q1", action: "validate" });
    expect(
      await screen.findByText(/your agreement was recorded/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agreed/ })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Suggest correction/ }),
    ).toBeDisabled();
  });
  it("requires a reason for a correction and explains the second review", async () => {
    ui(FIXTURES.caution);
    await userEvent.click(
      screen.getByRole("button", { name: /Suggest correction/ }),
    );
    expect(
      screen.getByText(/A second clinician reviews every correction/),
    ).toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText(/What should the diagnosis/),
      "Warning signs",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Submit correction" }),
    );
    expect(screen.getByText(/Tell us why/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Why\?/), "WHO 2024");
    await userEvent.click(
      screen.getByRole("button", { name: "Submit correction" }),
    );
    expect(send).toHaveBeenLastCalledWith({
      query_id: "q1",
      action: "correct",
      corrected_diagnosis: "Warning signs",
      reason: "WHO 2024",
    });
    expect(await screen.findByText(/sent for review/)).toBeInTheDocument();
  });
  it("labels agreement as 'Mark as reviewed' on a needs-review result", () => {
    ui(FIXTURES.review);
    expect(
      screen.getByRole("button", { name: /Mark as reviewed/ }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/feedback`. Expected: FAIL.

- [ ] **Step 3: Implement**

`components/feedback/result-text.ts`:

```ts
import type { ResultView } from "@/lib/result-view";
import type { parseBody } from "../result/parse-body";

export function resultAsText(
  view: ResultView,
  parsed: ReturnType<typeof parseBody>,
): string {
  const titles = view.sources.map((s) => s.title);
  const out: string[] = [];
  if (view.kind === "review")
    out.push("NEEDS CLINICIAN REVIEW before any clinical action is taken.", "");
  out.push(view.icd10 ? `${view.title} (ICD-10 ${view.icd10})` : view.title);
  if (view.confidence) out.push(view.confidence.label);
  if (parsed.summary) out.push("", parsed.summary);
  if (parsed.steps.length) {
    out.push("", "Recommended next steps:");
    parsed.steps.forEach((s, i) => {
      const n = s.citation
        ? ` [${titles.indexOf(s.citation.source_title) + 1}]`
        : "";
      out.push(
        s.citation?.action === "REDACT"
          ? `${i + 1}. [removed by safety checks]`
          : `${i + 1}. ${s.text}${n}`,
      );
    });
  }
  if (titles.length)
    out.push("", "Sources:", ...titles.map((t, i) => `[${i + 1}] ${t}`));
  out.push(
    "",
    "Decision support only. Final clinical judgement rests with the treating clinician.",
  );
  return out.join("\n");
}
```

`components/feedback/correction-form.tsx`:

```tsx
"use client";
import { useState } from "react";
import { correctionSchema } from "@/lib/form-schema";
import { Button } from "../ui/button";

export function CorrectionForm({
  onSubmit,
  onCancel,
  busy,
}: {
  onSubmit(v: { corrected_diagnosis: string; reason: string }): void;
  onCancel(): void;
  busy: boolean;
}) {
  const [v, setV] = useState({ corrected_diagnosis: "", reason: "" });
  const [err, setErr] = useState<Partial<Record<keyof typeof v, string>>>({});
  const field =
    "w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none focus:border-mint focus:ring-4 focus:ring-mint/15";
  return (
    <form
      className="mt-4 rounded-2xl border border-warn-line bg-warn-wash p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = correctionSchema.safeParse(v);
        if (!r.success) {
          setErr(
            Object.fromEntries(
              r.error.issues.map((i) => [i.path[0], i.message]),
            ),
          );
          return;
        }
        setErr({});
        onSubmit(r.data);
      }}
    >
      <label htmlFor="cd" className="mb-1.5 block text-[12.5px] text-warn-deep">
        What should the diagnosis or recommendation be?
      </label>
      <input
        id="cd"
        value={v.corrected_diagnosis}
        onChange={(e) => setV({ ...v, corrected_diagnosis: e.target.value })}
        className={field}
      />
      {err.corrected_diagnosis && (
        <p className="mt-1 text-xs text-bad">✕ {err.corrected_diagnosis}</p>
      )}
      <label
        htmlFor="cr"
        className="mb-1.5 mt-2.5 block text-[12.5px] text-warn-deep"
      >
        Why?{" "}
        <span aria-hidden className="text-bad">
          *
        </span>
      </label>
      <textarea
        id="cr"
        rows={2}
        value={v.reason}
        onChange={(e) => setV({ ...v, reason: e.target.value })}
        className={field}
      />
      {err.reason && <p className="mt-1 text-xs text-bad">✕ {err.reason}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="agree" disabled={busy}>
          Submit correction
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="border-0 bg-transparent"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <span className="ml-auto text-xs text-warn-deep">
          A second clinician reviews every correction.
        </span>
      </div>
    </form>
  );
}
```

`components/feedback/export-menu.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, Hash, Printer } from "lucide-react";
import type { ResultView } from "@/lib/result-view";
import type { parseBody } from "../result/parse-body";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { resultAsText } from "./result-text";

export function ExportMenu({
  queryId,
  view,
  parsed,
}: {
  queryId: string;
  view: ResultView;
  parsed: ReturnType<typeof parseBody>;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) =>
      !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const copy = async () => {
    await navigator.clipboard?.writeText(resultAsText(view, parsed));
    setCopied(true);
    setOpen(false);
    toast.show({ title: "Copied to clipboard", ms: 1800 });
  };
  const item =
    "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-left text-[13.5px] hover:bg-bg";
  return (
    <div ref={ref} className="relative ml-auto inline-flex">
      <Button variant="ghost" onClick={copy} className="rounded-r-none">
        {copied ? (
          "✓ Copied"
        ) : (
          <>
            <Copy aria-hidden className="size-4" />
            Copy
          </>
        )}
      </Button>
      <Button
        variant="ghost"
        aria-label="More export options"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-l-none border-l-0 px-2.5"
      >
        <ChevronDown aria-hidden className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[270px] rounded-2xl bg-white p-1.5 shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <button role="menuitem" className={item} onClick={copy}>
            <Copy aria-hidden className="size-4" />
            Copy as text
            <kbd className="ml-auto font-mono text-[10.5px] text-ink-3">⇧C</kbd>
          </button>
          <Link role="menuitem" className={item} href={`/print/${queryId}`}>
            <Printer aria-hidden className="size-4" />
            Print or save as PDF
            <kbd className="ml-auto font-mono text-[10.5px] text-ink-3">⌘P</kbd>
          </Link>
          {view.icd10 && (
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                void navigator.clipboard?.writeText(view.icd10!);
                setOpen(false);
                toast.show({ title: "ICD-10 code copied", ms: 1800 });
              }}
            >
              <Hash aria-hidden className="size-4" />
              Copy ICD-10 code
            </button>
          )}
          <p className="border-t border-line px-2.5 py-2 text-[11.5px] text-ink-3">
            Exports include the sources and the disclaimer.
          </p>
        </div>
      )}
    </div>
  );
}
```

`components/feedback/feedback-bar.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Check, PenLine } from "lucide-react";
import { useFeedback } from "@/lib/queries";
import type { ResultView } from "@/lib/result-view";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { CorrectionForm } from "./correction-form";

export function FeedbackBar({
  queryId,
  view,
  onDone,
  trailing,
}: {
  queryId: string;
  view: ResultView;
  onDone?(k: "agree" | "correct"): void;
  trailing?: React.ReactNode;
}) {
  const fb = useFeedback();
  const [mode, setMode] = useState<
    "idle" | "correcting" | "agreed" | "corrected"
  >("idle");
  const done = mode === "agreed" || mode === "corrected";
  const agreeLabel = view.kind === "review" ? "Mark as reviewed" : "I agree";
  return (
    <>
      {done && (
        <div className="order-first mb-3 w-full">
          <Banner
            tone="ok"
            title={
              mode === "agreed"
                ? "Thanks, your agreement was recorded"
                : "Thanks, your correction was sent for review"
            }
          >
            {mode === "agreed"
              ? "It helps us measure how often the system gets it right."
              : "A second clinician will review it before anything changes."}
          </Banner>
        </div>
      )}
      <Button
        variant="agree"
        disabled={done || fb.isPending}
        onClick={async () => {
          await fb.mutateAsync({ query_id: queryId, action: "validate" });
          setMode("agreed");
          onDone?.("agree");
        }}
      >
        <Check aria-hidden className="size-4" />
        {mode === "agreed" ? "Agreed" : agreeLabel}
      </Button>
      <Button
        variant="soft"
        disabled={done}
        aria-expanded={mode === "correcting"}
        onClick={() => setMode("correcting")}
        className={
          view.kind === "caution" && mode === "idle"
            ? "ring-2 ring-warn"
            : undefined
        }
      >
        <PenLine aria-hidden className="size-4" />
        Suggest correction
      </Button>
      {trailing}
      {mode === "correcting" && (
        <div className="w-full">
          <CorrectionForm
            busy={fb.isPending}
            onCancel={() => setMode("idle")}
            onSubmit={async (v) => {
              await fb.mutateAsync({
                query_id: queryId,
                action: "correct",
                ...v,
              });
              setMode("corrected");
              onDone?.("correct");
            }}
          />
        </div>
      )}
    </>
  );
}
```

The consultation page (Task 11) renders
`<ResultCard actions={<FeedbackBar … trailing={<ExportMenu …/>} />} />`.

`components/print/print-sheet.tsx` (A4, readable in black and white,
confidence as a word plus bars):

```tsx
/* eslint-disable @next/next/no-img-element */
import type { QueryCreateIn } from "@/lib/api/contract";
import type { ResultView } from "@/lib/result-view";
import type { parseBody } from "../result/parse-body";

export function PrintSheet({
  view,
  parsed,
  query,
  clinician,
  agreedAt,
}: {
  view: ResultView;
  parsed: ReturnType<typeof parseBody>;
  query: QueryCreateIn;
  clinician: string;
  agreedAt?: string;
}) {
  const titles = view.sources.map((s) => s.title);
  return (
    <article className="mx-auto min-h-[297mm] w-[210mm] bg-white p-[14mm] text-[12.5px] leading-relaxed text-black print:p-0">
      <header className="flex items-center justify-between border-b-2 border-black pb-3">
        <img src="/brand/logo.png" alt="Measured Health" className="h-9" />
        <p className="text-right text-[11px] text-neutral-600">
          Clinical decision support summary
          <br />
          <span className="font-mono">
            Printed {new Date().toLocaleString()}
          </span>
        </p>
      </header>
      {view.kind === "review" && (
        <p className="mt-3 border-2 border-black p-2 font-bold">
          NEEDS CLINICIAN REVIEW before any clinical action is taken.
        </p>
      )}
      <dl className="my-4 flex gap-6 text-xs">
        <div>
          <dt className="font-bold">Patient</dt>
          <dd>
            {query.patient_data.age} · {query.patient_data.sex}
          </dd>
        </div>
        <div>
          <dt className="font-bold">Priority</dt>
          <dd className="capitalize">{query.urgency}</dd>
        </div>
        <div>
          <dt className="font-bold">Requested by</dt>
          <dd>{clinician}</dd>
        </div>
      </dl>
      <p className="text-[11px] uppercase tracking-widest text-neutral-600">
        Assessment
      </p>
      <h1 className="font-display text-[34px] font-black leading-none">
        {view.title}{" "}
        {view.icd10 && (
          <span className="font-mono text-sm font-normal">
            ICD-10 {view.icd10}
          </span>
        )}
      </h1>
      {view.confidence && (
        <p className="mt-2 inline-block rounded-md border-[1.5px] border-black px-2.5 py-0.5 font-semibold uppercase">
          {"▮".repeat(view.confidence.bars)}
          {"▯".repeat(5 - view.confidence.bars)} {view.confidence.label}
        </p>
      )}
      {parsed.summary && <p className="mt-3">{parsed.summary}</p>}
      <ol className="my-3 list-decimal pl-5">
        {parsed.steps.map((s) => (
          <li key={s.text}>
            {s.citation?.action === "REDACT"
              ? "[removed by safety checks]"
              : s.text}
            {s.citation && s.citation.action !== "REDACT" && (
              <sup> [{titles.indexOf(s.citation.source_title) + 1}]</sup>
            )}
          </li>
        ))}
      </ol>
      <p className="text-[11px] uppercase tracking-widest text-neutral-600">
        Sources
      </p>
      <ul className="text-[11.5px]">
        {view.sources.map((s, i) => (
          <li key={s.title}>
            [{i + 1}] {s.title} ·{" "}
            {s.status === "verified"
              ? "✓ verified"
              : s.status === "review"
                ? "needs review"
                : "removed"}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px]">
        Safety checks: patient data protected ✓ · {view.claims.verified} of{" "}
        {view.claims.total} claims verified
      </p>
      <footer className="mt-10 flex justify-between border-t border-neutral-300 pt-2.5 text-[10.5px] text-neutral-600">
        <span>
          Decision support only. Final clinical judgement rests with the
          treating clinician.
          <br />
          {agreedAt && (
            <>
              Clinician agreed: {clinician} · {agreedAt} ·{" "}
            </>
          )}
          MHAI by Measured Health, in partnership with BHAI (University of
          Chicago)
        </span>
      </footer>
    </article>
  );
}
```

`app/print/[id]/page.tsx`. It opens in the same tab: the client-side navigation keeps the in-memory session and query cache, so nothing is stored.

```tsx
"use client";
import Link from "next/link";
import { use, useEffect } from "react";
import { PrintSheet } from "@/components/print/print-sheet";
import { parseBody } from "@/components/result/parse-body";
import { DEMO_USER } from "@/components/shell/sidebar";
import { useResult } from "@/lib/queries";
import { toResultView } from "@/lib/result-view";
import { useSession } from "@/lib/session-store";

export default function PrintPage({ params }: PageProps<"/print/[id]">) {
  const { id } = use(params);
  const item = useSession().get(id);
  const r = useResult(id, Boolean(item));
  useEffect(() => {
    if (r.data) setTimeout(() => window.print(), 300);
  }, [r.data]);
  if (!item || !r.data)
    return (
      <p className="p-10 text-center text-ink-3">
        This result is no longer available in this session.
      </p>
    );
  return (
    <>
      <Link
        href={`/c/${id}`}
        className="block p-4 text-sm text-mint-deep print:hidden"
      >
        ← Back to result
      </Link>
      <PrintSheet
        view={toResultView(r.data)}
        parsed={parseBody(r.data.response_text, r.data.citations)}
        query={item.query}
        clinician={`${DEMO_USER.name}, ${DEMO_USER.hospital}`}
      />
    </>
  );
}
```

Add this to `app/globals.css`:

```css
@media print {
  @page {
    size: A4;
    margin: 14mm;
  }
  body {
    background: #fff;
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run components/feedback`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/feedback components/print app/print app/globals.css
git commit -m "Add feedback, correction, export menu and the print layout"
```

---

### Task 11: Pages, plus the failed, first-visit, offline, degraded, timeout and unsaved-draft states

**Files:**

- Create: `app/(clinical)/c/[id]/page.tsx`, `components/consultation/consultation-view.tsx`, `components/states/failed-view.tsx`, `first-visit.tsx`, `offline-strip.tsx`, `degraded-strip.tsx`, `session-timeout.tsx`, `unsaved-guard.tsx`, `states.test.tsx`; `lib/hooks/use-idle.ts`, `use-idle.test.ts`, `use-online.ts`; `app/not-found.tsx`
- Modify: `app/(clinical)/page.tsx` (replace), `lib/form-schema.ts` (add `fromQuery`), `components/shell/app-shell.tsx` (mount the strips and the timeout)

**Interfaces:**

- Consumes: everything from Tasks 2–10.
- Produces:
  - `fromQuery(q: QueryCreateIn): FormValues`;
  - `useIdle(ms: number, onIdle: () => void): void`, where activity is pointer, key, scroll or touch;
  - `useOnline(): boolean`;
  - `<FailedView onRetry onEdit stalled? />`;
  - `<FirstVisit name onStart onExample(v: FormValues) />`;
  - `<UnsavedGuard dirty />`;
  - `<SessionTimeout warnAfterMs=780000 signOutAfterMs=900000 />`;
  - `<OfflineStrip />`, `<DegradedStrip />`.

**Plan 1 sign-out:** there's no auth yet. "Sign out" clears the session store
and the query cache, then navigates to `/` with a toast saying "Signed out
for privacy". Plan 2 swaps in a real sign-out.

- [ ] **Step 1: Write the failing tests**

`lib/hooks/use-idle.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIdle } from "./use-idle";

afterEach(() => vi.useRealTimers());

describe("useIdle", () => {
  it("fires after the idle period and resets on activity", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    renderHook(() => useIdle(1000, onIdle));
    vi.advanceTimersByTime(900);
    window.dispatchEvent(new Event("keydown"));
    vi.advanceTimersByTime(900);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
```

`components/states/states.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FailedView } from "./failed-view";
import { FirstVisit } from "./first-visit";
import { UnsavedGuard } from "./unsaved-guard";

describe("FailedView", () => {
  it("offers Try again as the main action and keeps inputs via Edit question", async () => {
    const onRetry = vi.fn(),
      onEdit = vi.fn();
    render(<FailedView onRetry={onRetry} onEdit={onEdit} />);
    expect(
      screen.getByRole("heading", { name: "We couldn't complete this one" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your answers are saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Try again/ }));
    await userEvent.click(
      screen.getByRole("button", { name: /Edit question/ }),
    );
    expect(onRetry).toHaveBeenCalled();
    expect(onEdit).toHaveBeenCalled();
  });
  it("explains a stall differently from a failure", () => {
    render(<FailedView stalled onRetry={vi.fn()} onEdit={vi.fn()} />);
    expect(
      screen.getByText(/taking much longer than usual/),
    ).toBeInTheDocument();
  });
});

describe("FirstVisit", () => {
  it("fills the form from an example", async () => {
    const onExample = vi.fn();
    render(
      <FirstVisit name="Dr. Reyes" onStart={vi.fn()} onExample={onExample} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: /Febrile child/ }),
    );
    expect(onExample).toHaveBeenCalledWith(
      expect.objectContaining({ age: "3", sex: "female" }),
    );
  });
});

describe("UnsavedGuard", () => {
  it("asks the browser to confirm leaving only when dirty, and writes nothing to storage", () => {
    const { rerender } = render(<UnsavedGuard dirty={false} />);
    const e1 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e1);
    expect(e1.defaultPrevented).toBe(false);
    rerender(<UnsavedGuard dirty />);
    const e2 = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(true);
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });
  it("asks before following an in-app link when dirty; Keep editing is the default", async () => {
    render(
      <>
        <UnsavedGuard dirty />
        <a href="/help">Help</a>
      </>,
    );
    await userEvent.click(screen.getByText("Help"));
    expect(
      screen.getByRole("dialog", { name: "Discard this draft?" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep editing" })).toHaveFocus();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run components/states lib/hooks`. Expected: FAIL.

- [ ] **Step 3: Implement the hooks**

`lib/hooks/use-idle.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";

export function useIdle(ms: number, onIdle: () => void) {
  const cb = useRef(onIdle);
  cb.current = onIdle;
  useEffect(() => {
    let t = setTimeout(() => cb.current(), ms);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => cb.current(), ms);
    };
    const ev = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    ev.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(t);
      ev.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);
}
```

`lib/hooks/use-online.ts`:

```ts
"use client";
import { useSyncExternalStore } from "react";

const sub = (f: () => void) => {
  window.addEventListener("online", f);
  window.addEventListener("offline", f);
  return () => {
    window.removeEventListener("online", f);
    window.removeEventListener("offline", f);
  };
};
export const useOnline = () =>
  useSyncExternalStore(
    sub,
    () => navigator.onLine,
    () => true,
  );
```

Add this to `lib/form-schema.ts`:

```ts
export function fromQuery(q: QueryCreateIn): FormValues {
  return {
    age: String(q.patient_data.age),
    sex: q.patient_data.sex,
    urgency: q.urgency,
    symptoms: q.patient_data.symptoms,
    question: q.clinical_question,
    specialty: q.specialty ?? "",
    history: q.patient_data.medical_history ?? "",
  };
}
```

- [ ] **Step 4: Implement the state components**

`components/states/failed-view.tsx`:

```tsx
import { RotateCw } from "lucide-react";
import { Button } from "../ui/button";

export function FailedView({
  onRetry,
  onEdit,
  stalled,
}: {
  onRetry(): void;
  onEdit(): void;
  stalled?: boolean;
}) {
  return (
    <section className="card-v3 mx-auto mt-8 max-w-[520px] p-7 text-center">
      <div
        aria-hidden
        className="mx-auto mb-3.5 grid size-16 place-items-center rounded-[20px] bg-bad-wash text-bad"
      >
        <RotateCw className="size-7" />
      </div>
      <h2 className="font-display text-[34px] font-black leading-none">
        We couldn&apos;t complete this one
      </h2>
      <p className="mt-3 leading-relaxed text-ink-2">
        {stalled
          ? "The analysis is taking much longer than usual, so we stopped waiting."
          : "The analysis service didn't respond in time."}{" "}
        Your answers are saved. Nothing was lost.
      </p>
      <div className="mt-4 flex justify-center gap-2.5">
        <Button onClick={onRetry}>
          <RotateCw aria-hidden className="size-4" />
          Try again
        </Button>
        <Button variant="soft" onClick={onEdit}>
          Edit question
        </Button>
      </div>
      <p className="mt-4 text-[12.5px] text-ink-3">
        Still failing? Ask your hospital admin to check the system status.
      </p>
    </section>
  );
}
```

`components/states/first-visit.tsx`:

```tsx
import type { FormValues } from "@/lib/form-schema";
import { emptyForm } from "@/lib/form-schema";
import { Button } from "../ui/button";

const EXAMPLES: { title: string; hint: string; v: FormValues }[] = [
  {
    title: "Febrile child",
    hint: "3 F, fever 3 days, rash. Dengue?",
    v: {
      ...emptyForm,
      age: "3",
      sex: "female",
      urgency: "urgent",
      symptoms: ["Fever", "Rash"],
      question:
        "3-year-old girl, fever for 3 days with a maculopapular rash, lives in a dengue area. Likely diagnosis and when to admit?",
    },
  },
  {
    title: "Chest pain",
    hint: "54 M, central pain radiating to arm.",
    v: {
      ...emptyForm,
      age: "54",
      sex: "male",
      urgency: "urgent",
      symptoms: ["Chest pain", "Sweating"],
      question:
        "54-year-old male, central chest pain for 40 min radiating to the left arm, diaphoretic. BP 150/95, HR 104. Likely diagnosis and immediate management?",
    },
  },
  {
    title: "Low potassium",
    hint: "K⁺ 2.9 on routine bloods.",
    v: {
      ...emptyForm,
      age: "67",
      sex: "female",
      urgency: "routine",
      symptoms: ["Weakness"],
      question:
        "67-year-old woman, serum potassium 2.9 mmol/L on routine bloods, on a thiazide. Causes and replacement plan?",
    },
  },
];

export function FirstVisit({
  name,
  onStart,
  onExample,
}: {
  name: string;
  onStart(): void;
  onExample(v: FormValues): void;
}) {
  return (
    <section className="mx-auto mt-8 max-w-[700px] text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
        Welcome, {name}
      </p>
      <h2 className="my-2.5 font-display text-5xl font-black leading-[.95]">
        Ask your first clinical question
      </h2>
      <p className="mx-auto mb-6 max-w-[520px] text-[15.5px] leading-relaxed text-ink-2">
        Describe a patient and what you need to know. You&apos;ll get an
        evidence-checked answer with sources, usually in under 20 seconds.
      </p>
      <Button onClick={onStart}>＋ Start a consultation</Button>
      <p className="mb-2 mt-8 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3">
        Or try an example
      </p>
      <div className="grid gap-2.5 text-left sm:grid-cols-3">
        {EXAMPLES.map((e) => (
          <button
            key={e.title}
            type="button"
            onClick={() => onExample(e.v)}
            className="card-v3 px-4 py-3.5 text-left"
          >
            <b>{e.title}</b>
            <span className="mt-1 block text-[12.5px] text-ink-3">
              {e.hint}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

`components/states/unsaved-guard.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** Guards in-app links and tab close while a draft exists. The draft never leaves memory. */
export function UnsavedGuard({ dirty }: { dirty: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href === window.location.pathname)
        return;
      e.preventDefault();
      e.stopPropagation();
      setPending(href);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);
  return (
    <Dialog
      open={pending !== null}
      onClose={() => setPending(null)}
      title="Discard this draft?"
    >
      <p className="mb-[18px] text-[14.5px] leading-normal text-ink-2">
        If you leave now, what you typed will be lost.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => setPending(null)}>Keep editing</Button>
        <Button
          variant="ghost"
          className="border-0 text-bad"
          onClick={() => {
            const h = pending!;
            setPending(null);
            router.push(h);
          }}
        >
          Discard
        </Button>
      </div>
    </Dialog>
  );
}
```

`Keep editing` comes first in the DOM, so the dialog focuses it: the safe
default.

`components/states/offline-strip.tsx`:

```tsx
"use client";
import { useOnline } from "@/lib/hooks/use-online";

export function OfflineStrip() {
  return useOnline() ? null : (
    <div
      role="status"
      className="flex items-center gap-2.5 bg-ink px-[26px] py-2 text-[13px] text-white"
    >
      ⚡ You&apos;re offline. Showing what&apos;s already loaded. Analyse will
      work again when you&apos;re back online.
    </div>
  );
}
```

`components/states/degraded-strip.tsx`:

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/api/client";

export function DegradedStrip() {
  const { data } = useQuery({
    queryKey: ["readyz"],
    queryFn: () => getClient().getReadiness(),
    refetchInterval: 60_000,
  });
  return data && !data.ok ? (
    <div
      role="status"
      className="flex items-center gap-2.5 border-b border-[#f1df9a] bg-[#fff8dc] px-[26px] py-2 text-[13px] text-[#7a6512]"
    >
      ⚠ Some services are running slowly right now. Results may take longer than
      usual.
    </div>
  ) : null;
}
```

`components/states/session-timeout.tsx`:

```tsx
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useIdle } from "@/lib/hooks/use-idle";
import { useSession } from "@/lib/session-store";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

export function SessionTimeout({
  warnAfterMs = 780_000,
  signOutAfterMs = 900_000,
}: {
  warnAfterMs?: number;
  signOutAfterMs?: number;
}) {
  const [warn, setWarn] = useState(false);
  const [left, setLeft] = useState(0);
  const session = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const signOut = () => {
    setWarn(false);
    session.clear();
    qc.clear();
    router.push("/");
    toast.show({
      title: "Signed out for privacy",
      body: "Your session was cleared after inactivity.",
    });
  };
  useIdle(warnAfterMs, () => {
    setWarn(true);
    setLeft(Math.round((signOutAfterMs - warnAfterMs) / 1000));
  });
  useEffect(() => {
    if (!warn) return;
    const t = setInterval(
      () =>
        setLeft((s) => {
          if (s <= 1) {
            clearInterval(t);
            signOut();
            return 0;
          }
          return s - 1;
        }),
      1000,
    );
    return () => clearInterval(t);
  }, [warn]); // eslint-disable-line react-hooks/exhaustive-deps -- signOut is stable enough for a countdown
  return (
    <Dialog open={warn} onClose={() => setWarn(false)} title="Still there?">
      <p className="mb-[18px] text-[14.5px] leading-normal text-ink-2">
        For patient privacy you&apos;ll be signed out in{" "}
        <b className="font-mono tabular text-warn-deep">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </b>{" "}
        because of inactivity.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={() => setWarn(false)}>Stay signed in</Button>
        <Button variant="ghost" onClick={signOut}>
          Sign out now
        </Button>
      </div>
    </Dialog>
  );
}
```

`app/not-found.tsx`:

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="canvas-v3 grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <div
          aria-hidden
          className="mx-auto mb-4 grid size-20 place-items-center rounded-[26px] bg-lilac text-4xl text-bloom"
        >
          ?
        </div>
        <h1 className="font-display text-[42px] font-black leading-none">
          We can&apos;t find that
        </h1>
        <p className="mx-auto my-3 max-w-[420px] leading-relaxed text-ink-2">
          This consultation doesn&apos;t exist, or it was in a session that has
          ended.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-full bg-mint px-5 font-semibold text-white"
        >
          Back to home
        </Link>
        <p className="mt-3.5 font-mono text-xs text-ink-3">Error 404</p>
      </div>
    </main>
  );
}
```

In `components/shell/app-shell.tsx`, render these above `{children}`
inside `<main>`:

```tsx
<OfflineStrip />
<DegradedStrip />
```

Render this after `<MobileDrawer>`:

```tsx
<SessionTimeout />
```

- [ ] **Step 5: Implement the pages**

`app/(clinical)/page.tsx`:

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { ConsultationForm } from "@/components/form/consultation-form";
import { useShell } from "@/components/shell/app-shell";
import { DEMO_USER } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { FirstVisit } from "@/components/states/first-visit";
import { UnsavedGuard } from "@/components/states/unsaved-guard";
import { emptyForm, fromQuery, type FormValues } from "@/lib/form-schema";
import { useSubmitQuery } from "@/lib/queries";
import { useSession } from "@/lib/session-store";

function Home() {
  const router = useRouter();
  const editId = useSearchParams().get("edit");
  const session = useSession();
  const shell = useShell();
  const submit = useSubmitQuery();
  const editing = editId ? session.get(editId) : undefined;
  const [started, setStarted] = useState(
    session.items.length > 0 || Boolean(editing),
  );
  const [initial, setInitial] = useState<FormValues>(
    editing ? fromQuery(editing.query) : emptyForm,
  );
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <TopBar
        title="New consultation"
        sub={dirty ? "Draft · not submitted" : undefined}
        leading={
          <button
            aria-label="Open menu"
            onClick={shell.openDrawer}
            className="grid size-10 place-items-center rounded-xl border border-line bg-white md:hidden"
          >
            <Menu className="size-5" />
          </button>
        }
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        {!started ? (
          <FirstVisit
            name={DEMO_USER.name}
            onStart={() => setStarted(true)}
            onExample={(v) => {
              setInitial(v);
              setStarted(true);
            }}
          />
        ) : (
          <div className="mx-auto max-w-[700px]">
            <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
              New consultation
            </p>
            <h2 className="font-display text-[40px] font-black leading-none">
              What&apos;s going on with your patient?
            </h2>
            <p className="mb-5 mt-1.5 text-[14.5px] text-ink-2">
              Three quick sections. The more detail you give, the better the
              answer.
            </p>
            <ConsultationForm
              key={JSON.stringify(initial)}
              initial={initial}
              onDirtyChange={setDirty}
              onSubmit={async (q) => {
                setDirty(false);
                const { query_id } = await submit.mutateAsync(q);
                router.push(`/c/${query_id}`);
              }}
            />
          </div>
        )}
      </div>
      <UnsavedGuard dirty={dirty && !submit.isPending} />
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
```

`components/consultation/consultation-view.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Menu, PanelRight } from "lucide-react";
import { EvidenceDock } from "../evidence/evidence-dock";
import { ExportMenu } from "../feedback/export-menu";
import { FeedbackBar } from "../feedback/feedback-bar";
import { ProcessingView } from "../processing/processing-view";
import { parseBody } from "../result/parse-body";
import { ResultCard } from "../result/result-card";
import { useShell } from "../shell/app-shell";
import { TopBar } from "../shell/top-bar";
import { FailedView } from "../states/failed-view";
import { HighlightProvider } from "@/lib/highlight";
import { useQueryStatus, useResult, useSubmitQuery } from "@/lib/queries";
import { toResultView } from "@/lib/result-view";
import { useSession } from "@/lib/session-store";

export function ConsultationView({ id }: { id: string }) {
  const router = useRouter();
  const session = useSession();
  const shell = useShell();
  const item = session.get(id);
  const st = useQueryStatus(id);
  const result = useResult(id, st.status === "completed");
  const resubmit = useSubmitQuery();
  const [panel, setPanel] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (st.status === "completed" || st.status === "failed") return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [st.status]);

  const view = useMemo(
    () => (result.data ? toResultView(result.data) : null),
    [result.data],
  );
  const parsed = useMemo(
    () =>
      result.data
        ? parseBody(result.data.response_text, result.data.citations)
        : null,
    [result.data],
  );
  const failed = st.status === "failed" || st.stalled || result.isError;

  useEffect(() => {
    if (view)
      session.update(id, { kind: view.kind, flagged: view.kind !== "high" });
    else if (failed) session.update(id, { kind: "failed" });
  }, [view, failed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!item) router.replace("/");
  }, [item, router]);

  if (!item) return null;
  const done = view && parsed;
  return (
    <HighlightProvider>
      <TopBar
        title={item.title}
        urgency={item.urgency}
        sub={
          done
            ? `Completed in ${view.seconds} s`
            : `Started ${new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        }
        leading={
          <button
            aria-label="Open menu"
            onClick={shell.openDrawer}
            className="grid size-10 place-items-center rounded-xl border border-line bg-white md:hidden"
          >
            <Menu className="size-5" />
          </button>
        }
        actions={
          done && (
            <button
              aria-pressed={panel}
              onClick={() => setPanel((p) => !p)}
              className="hidden h-[34px] items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[12.5px] text-ink-2 lg:flex"
            >
              <PanelRight aria-hidden className="size-4" />
              Evidence panel
            </button>
          )
        }
      />
      <div
        className={
          done && panel
            ? "grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]"
            : "flex min-h-0 flex-1"
        }
      >
        <div className="min-w-0 flex-1 overflow-auto px-4 pb-32 pt-7 md:px-[26px]">
          {failed ? (
            <FailedView
              stalled={st.stalled}
              onRetry={async () => {
                const { query_id } = await resubmit.mutateAsync(item.query);
                router.replace(`/c/${query_id}`);
              }}
              onEdit={() => router.push(`/?edit=${id}`)}
            />
          ) : done ? (
            <ResultCard
              view={view}
              parsed={parsed}
              actions={
                <FeedbackBar
                  queryId={id}
                  view={view}
                  trailing={
                    <ExportMenu queryId={id} view={view} parsed={parsed} />
                  }
                />
              }
            />
          ) : (
            <ProcessingView
              stage={st.stage}
              progress={st.progress}
              elapsedMs={now - item.createdAt}
            />
          )}
        </div>
        {done && <EvidenceDock view={view} open={panel} />}
      </div>
    </HighlightProvider>
  );
}
```

`app/(clinical)/c/[id]/page.tsx`:

```tsx
"use client";
import { use } from "react";
import { ConsultationView } from "@/components/consultation/consultation-view";

export default function Page({ params }: PageProps<"/c/[id]">) {
  return <ConsultationView id={use(params).id} />;
}
```

- [ ] **Step 6: Run the tests, then walk through the flow**

Run: `npx vitest run && npm run lint && npm run typecheck`. Expected: PASS.

Then run `NEXT_PUBLIC_USE_MOCK=true npm run dev` and check four questions:

| Question text  | Expected                                                                                 |
| -------------- | ---------------------------------------------------------------------------------------- |
| "chest pain …" | High confidence, with the evidence panel and sources                                     |
| "fever …"      | The amber banner, and the correction form works                                          |
| "potassium …"  | The red banner, no pill, a struck-through removed claim, and the reduced-accuracy notice |
| "fail …"       | Couldn't complete. Edit question returns to a filled form                                |

Also check:

- Type in the form, then click Help: the discard dialog appears.
- DevTools → Application → Storage stays empty throughout.

- [ ] **Step 7: Commit**

```bash
git add app components lib
git commit -m "Wire the consultation flow and add failure, idle and offline states"
```

---

### Task 12: Search (⌘K), keyboard shortcuts and Help

**Files:**

- Create: `lib/hooks/use-shortcuts.ts`, `use-shortcuts.test.ts`, `components/utility/command-palette.tsx`, `shortcuts-dialog.tsx`, `command-palette.test.tsx`, `app/(clinical)/help/page.tsx`
- Modify: `components/shell/app-shell.tsx` (mount the palette, the shortcuts dialog and the global keys), `components/consultation/consultation-view.tsx` (result shortcuts)

**Interfaces:**

- Consumes: `useShell` (Task 7), `useSession` (Task 6), `Dialog` (Task 3), `PartnerLine` (Task 1), `RESULT_LABEL` (Task 2).
- Produces:
  - `useShortcuts(map: Record<string, (e: KeyboardEvent) => void>)`, with keys written like `"mod+k"`, `"?"`, `"n"`, `"e"`, `"a"`, `"c"`, `"shift+c"`, `"mod+p"`. Single-letter keys are ignored while typing in an input, textarea, select or contenteditable;
  - `searchItems(items: SessionItem[], q: string): SessionItem[]`, which matches title, symptoms, specialty and result label, case-insensitively;
  - `<CommandPalette open onClose />`;
  - `<ShortcutsDialog open onClose />`.

| Keys        | Where    | Action                    |
| ----------- | -------- | ------------------------- |
| ⌘K / Ctrl K | Anywhere | Open search               |
| ?           | Anywhere | Open shortcuts            |
| N           | Anywhere | New consultation          |
| E           | Result   | Toggle the evidence panel |
| A           | Result   | Agree                     |
| C           | Result   | Suggest correction        |
| ⇧C          | Result   | Copy as text              |
| ⌘P / Ctrl P | Result   | Go to the print page      |
| ↑ ↓ ↵ Esc   | Palette  | Move, open, close         |

- [ ] **Step 1: Write the failing tests**

`lib/hooks/use-shortcuts.test.ts`:

```ts
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useShortcuts } from "./use-shortcuts";

const press = (
  key: string,
  o: KeyboardEventInit = {},
  target: EventTarget = window,
) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...o }),
  );

describe("useShortcuts", () => {
  it("fires mod+k with Ctrl or Meta", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ "mod+k": f }));
    press("k", { ctrlKey: true });
    press("k", { metaKey: true });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("ignores single letters while typing", () => {
    const f = vi.fn();
    renderHook(() => useShortcuts({ n: f }));
    const input = document.body.appendChild(document.createElement("textarea"));
    press("n", {}, input);
    expect(f).not.toHaveBeenCalled();
    press("n");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
```

`components/utility/command-palette.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { searchItems } from "./command-palette";

const it1 = {
  id: "1",
  title: "Febrile child, 3 F",
  urgency: "urgent" as const,
  createdAt: 0,
  kind: "caution" as const,
  query: {
    patient_data: {
      age: 3,
      sex: "female" as const,
      symptoms: ["Fever", "Rash"],
    },
    clinical_question: "x",
    urgency: "urgent" as const,
  },
};
const it2 = {
  ...it1,
  id: "2",
  title: "Post-op fever, day 2",
  kind: "high" as const,
};
const it3 = {
  ...it1,
  id: "3",
  title: "Chest pain, 54 M",
  kind: "high" as const,
  query: {
    ...it1.query,
    patient_data: { ...it1.query.patient_data, symptoms: ["Chest pain"] },
  },
};

describe("searchItems", () => {
  it("matches title and symptoms case-insensitively", () => {
    expect(searchItems([it1, it2, it3], "FEV").map((i) => i.id)).toEqual([
      "1",
      "2",
    ]);
  });
  it("matches the plain-language result label", () => {
    expect(searchItems([it1, it3], "caution").map((i) => i.id)).toEqual(["1"]);
  });
  it("returns everything for an empty query", () => {
    expect(searchItems([it1, it2], "  ")).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run lib/hooks/use-shortcuts.test.ts components/utility`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/hooks/use-shortcuts.ts`:

```ts
"use client";
import { useEffect, useRef } from "react";

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function useShortcuts(map: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const combo = `${mod ? "mod+" : ""}${e.shiftKey && k.length === 1 && k !== "?" ? "shift+" : ""}${k}`;
      const fn = ref.current[combo];
      if (!fn) return;
      if (!mod && typing(e.target)) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}
```

`components/utility/command-palette.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, Plus, Search, Stethoscope } from "lucide-react";
import { RESULT_LABEL } from "@/lib/labels";
import { useSession, type SessionItem } from "@/lib/session-store";
import { cn } from "../ui/cn";

export function searchItems(items: SessionItem[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((i) =>
    [
      i.title,
      ...i.query.patient_data.symptoms,
      i.query.specialty ?? "",
      i.kind ? RESULT_LABEL[i.kind] : "",
    ].some((f) => f.toLowerCase().includes(t)),
  );
}

type Row = {
  key: string;
  label: string;
  sub?: string;
  icon: typeof Plus;
  go(): void;
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const router = useRouter();
  const { items } = useSession();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => input.current?.focus(), 0);
    }
  }, [open]);
  const rows: Row[] = useMemo(
    () => [
      ...searchItems(items, q)
        .slice(0, 6)
        .map((i) => ({
          key: i.id,
          label: i.title,
          sub: i.kind ? RESULT_LABEL[i.kind] : "Analysing",
          icon: Stethoscope,
          go: () => router.push(`/c/${i.id}`),
        })),
      ...[
        {
          key: "new",
          label: "New consultation",
          icon: Plus,
          go: () => router.push("/"),
        },
        {
          key: "help",
          label: "Help & guide",
          icon: HelpCircle,
          go: () => router.push("/help"),
        },
      ].filter(
        (a) =>
          !q.trim() || a.label.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    ],
    [items, q, router],
  );
  if (!open) return null;
  const run = (r?: Row) => {
    if (r) {
      onClose();
      r.go();
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(620px,100%)] overflow-hidden rounded-[22px] bg-white shadow-[0_40px_80px_-30px_#1c0d22aa]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-4">
          <Search aria-hidden className="size-5 text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Search consultations or type a command"
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            aria-activedescendant={
              rows[sel] ? `cmdk-${rows[sel].key}` : undefined
            }
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, rows.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter") run(rows[sel]);
              if (e.key === "Escape") onClose();
            }}
            className="flex-1 bg-transparent text-[17px] outline-none"
          />
          <kbd className="rounded-md border border-b-2 border-lilac-2 px-1.5 font-mono text-[11px] text-ink-3">
            esc
          </kbd>
        </div>
        <ul
          id="cmdk-list"
          role="listbox"
          className="max-h-[50vh] overflow-auto py-2"
        >
          {rows.length === 0 && (
            <li className="px-[18px] py-3 text-sm text-ink-3">
              No matches in this session.
            </li>
          )}
          {rows.map((r, i) => (
            <li
              key={r.key}
              id={`cmdk-${r.key}`}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(r)}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-[18px] py-2.5 text-sm",
                i === sel && "bg-mint-wash",
              )}
            >
              <span
                aria-hidden
                className="grid size-[30px] place-items-center rounded-[9px] bg-lilac text-bloom"
              >
                <r.icon className="size-4" />
              </span>
              <span>
                {r.label}
                {r.sub && (
                  <small className="block text-xs text-ink-3">{r.sub}</small>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex gap-4 border-t border-line px-[18px] py-2.5 text-[11.5px] text-ink-3">
          <span>↑ ↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </p>
      </div>
    </div>
  );
}
```

`components/utility/shortcuts-dialog.tsx`:

```tsx
"use client";
import { Dialog } from "../ui/dialog";

const ROWS: [string, string][] = [
  ["Search / commands", "⌘ K"],
  ["New consultation", "N"],
  ["Submit form", "⌘ ↵"],
  ["Toggle evidence panel", "E"],
  ["Agree with result", "A"],
  ["Suggest correction", "C"],
  ["Copy result", "⇧ C"],
  ["Print / export", "⌘ P"],
  ["Show shortcuts", "?"],
];

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <p className="mb-4 text-sm text-ink-2">
        Work faster without the mouse. On Windows, use Ctrl for ⌘.
      </p>
      <dl className="grid grid-cols-1 gap-x-7 sm:grid-cols-2">
        {ROWS.map(([d, k]) => (
          <div
            key={d}
            className="flex items-center justify-between border-b border-line py-2 text-[13.5px] text-ink-2"
          >
            <dt>{d}</dt>
            <dd>
              <kbd className="rounded-md border border-b-2 border-lilac-2 bg-white px-1.5 font-mono text-[11px]">
                {k}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="min-h-10 rounded-full bg-mint px-5 font-semibold text-white"
        >
          Done
        </button>
      </div>
    </Dialog>
  );
}
```

In `components/shell/app-shell.tsx`, add the shortcuts state and the global
keys, and render the palette and the dialog:

```tsx
const router = useRouter();
const [keysOpen, setKeysOpen] = useState(false);
useShortcuts({ "mod+k": () => setSearchOpen(true), "?": () => setKeysOpen(true), n: () => router.push("/") });
// …inside the provider, after <MobileDrawer>:
<CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
<ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
```

In `components/consultation/consultation-view.tsx`, add the result keys.
`FeedbackBar` and `ExportMenu` expose their actions through a ref.

React 19 passes `ref` as a normal prop, so no `forwardRef` is needed.

In `components/feedback/feedback-bar.tsx`:

```tsx
import { useImperativeHandle, useState, type Ref } from "react";
// add `ref` to the props type:
//   { queryId; view; onDone?; trailing?; ref?: Ref<{ agree(): void; correct(): void }> }
// inside the component, extract the agree handler and expose both actions:
const agree = async () => {
  await fb.mutateAsync({ query_id: queryId, action: "validate" });
  setMode("agreed");
  onDone?.("agree");
};
useImperativeHandle(
  ref,
  () => ({
    agree: () => {
      if (mode === "idle") void agree();
    },
    correct: () => {
      if (mode === "idle") setMode("correcting");
    },
  }),
  [mode],
); // eslint-disable-line react-hooks/exhaustive-deps
// and the button becomes: <Button … onClick={agree}>
```

In `components/feedback/export-menu.tsx`:

```tsx
import { useImperativeHandle, type Ref } from "react";
// props gain `ref?: Ref<{ copy(): void }>`
useImperativeHandle(ref, () => ({ copy: () => void copy() }));
```

Pass `ref={fbRef}` to `<FeedbackBar>` and `ref={exRef}` to `<ExportMenu>`.

Then, in `ConsultationView`:

```tsx
const fbRef = useRef<{ agree(): void; correct(): void }>(null);
const exRef = useRef<{ copy(): void }>(null);
useShortcuts(
  done
    ? {
        e: () => setPanel((p) => !p),
        a: () => fbRef.current?.agree(),
        c: () => fbRef.current?.correct(),
        "shift+c": () => exRef.current?.copy(),
        "mod+p": () => router.push(`/print/${id}`),
      }
    : {},
);
```

`app/(clinical)/help/page.tsx`:

```tsx
import { BookOpen, PenLine, ShieldCheck } from "lucide-react";
import { Logo, PartnerLine } from "@/components/ui/brand";
import { ConfidencePill } from "@/components/ui/confidence-pill";
import { TopBar } from "@/components/shell/top-bar";

const CARDS = [
  {
    icon: PenLine,
    title: "Ask a good question",
    body: "Age, sex, vitals, duration and history give the best answers.",
  },
  {
    icon: BookOpen,
    title: "Read the confidence",
    body: "High, Use with caution, or Needs review: what each means and what to do.",
  },
  {
    icon: ShieldCheck,
    title: "Check the evidence",
    body: "Every claim links to the guideline it came from.",
  },
];

export default function Help() {
  return (
    <>
      <TopBar title="Help & guide" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[860px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Help &amp; guide
          </p>
          <h2 className="font-display text-[44px] font-black leading-none">
            How to use MHAI
          </h2>
          <div className="my-5 grid gap-3 sm:grid-cols-3">
            {CARDS.map((c) => (
              <section key={c.title} className="card-v3 p-4">
                <span
                  aria-hidden
                  className="grid size-9 place-items-center rounded-[11px] bg-mint-wash text-mint-deep"
                >
                  <c.icon className="size-4" />
                </span>
                <h3 className="mb-1 mt-2 text-[15px] font-semibold">
                  {c.title}
                </h3>
                <p className="text-[13px] leading-normal text-ink-3">
                  {c.body}
                </p>
              </section>
            ))}
          </div>
          <section className="card-v3 mb-3.5 flex flex-wrap items-center gap-4 p-4">
            <Logo className="h-10 w-auto" />
            <span
              aria-hidden
              className="font-display text-3xl font-black text-ink-3"
            >
              ×
            </span>
            <PartnerLine />
            <p className="min-w-60 flex-1 text-[13.5px] leading-normal text-ink-2">
              <b className="text-ink">About MHAI.</b> Built by Measured Health
              in partnership with BHAI at the University of Chicago, our
              research partner in healthcare AI for diagnostic support and
              clinical decision-making.
            </p>
          </section>
          <section className="card-v3 p-5">
            <h3 className="mb-2 font-semibold">What the labels mean</h3>
            <dl className="grid grid-cols-[180px_1fr] text-[13.5px] max-sm:grid-cols-1">
              <dt className="border-t border-line py-2.5">
                <ConfidencePill label="High confidence" bars={4} />
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Claims match the guidelines. Still apply your clinical
                judgement.
              </dd>
              <dt className="border-t border-line py-2.5">
                <ConfidencePill label="Use with caution" bars={2} />
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Some parts weren&apos;t verified. Check the amber-tagged lines
                before acting.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold text-bad-deep">
                Needs review
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Not enough evidence. Don&apos;t act on it without review.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold">
                Evidence-backed claims
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                How many statements were matched to a source.
              </dd>
              <dt className="border-t border-line py-2.5 font-semibold">
                Answer stability
              </dt>
              <dd className="border-t border-line py-2.5 text-ink-2">
                Whether the system gives the same answer when asked again.
              </dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run the tests and the checks**

Run: `npx vitest run && npm run lint && npm run typecheck`. Expected: PASS.

Manual check:

- ⌘K opens search, "fev" finds the febrile child, and ↵ opens it.
- ? lists the shortcuts.
- On a result, A, C, E, ⇧C and ⌘P work.
- N while typing in the question field types an "n".

- [ ] **Step 5: Commit**

```bash
git add lib/hooks components app
git commit -m "Add search, keyboard shortcuts and the help page"
```

---

### Task 13: Motion: reveal order, loading skeleton, error shake, brand draw and screen transitions

Read first: `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`.

**Files:**

- Create: `components/result/result-skeleton.tsx`, `lib/motion.test.ts`
- Modify: `app/globals.css`, `components/result/result-card.tsx`, `components/form/consultation-form.tsx`, `components/states/first-visit.tsx`, `components/consultation/consultation-view.tsx`, `app/(clinical)/layout.tsx`

**Interfaces:**

- Consumes: the motion tokens (Task 1) and `Skeleton` (Task 3).
- Produces:
  - `<ResultSkeleton />`, shown while `status === "completed"` and the result is still loading, and only after a 200 ms delay;
  - the CSS classes `.reveal` (stagger children 80 ms apart), `.shake-once`, `.draw-once`.

- [ ] **Step 1: Write the failing guard test**

This test checks that every keyframe the components use exists, and that
reduced motion turns everything off.

`lib/motion.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const files = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });

describe("motion", () => {
  it("defines every keyframe used in components", () => {
    const used = new Set(
      files("components").flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/animate-\[([a-zA-Z-]+)_/g)].map(
          (m) => m[1],
        ),
      ),
    );
    for (const name of used)
      expect(css, `@keyframes ${name}`).toMatch(
        new RegExp(`@keyframes ${name}\\b`),
      );
  });
  it("turns motion off for reduced-motion users", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration: 1ms !important/,
    );
  });
  it("never animates the safety banner", () => {
    expect(readFileSync("components/ui/banner.tsx", "utf8")).not.toMatch(
      /animate-|transition/,
    );
  });
  it("uses only the motion tokens for durations", () => {
    for (const f of files("components"))
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /duration-(?!\[var\(--t-)\d/,
      );
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run lib/motion.test.ts`
Expected: FAIL. The `grow` keyframe may already exist, but `shake`,
`draw` and `reveal` don't yet. The test is written to catch exactly these
gaps, so fix whichever names it reports.

- [ ] **Step 3: Implement**

Add this to `app/globals.css`:

```css
@keyframes shake {
  20% {
    transform: translateX(-5px);
  }
  40% {
    transform: translateX(5px);
  }
  60% {
    transform: translateX(-3px);
  }
  80% {
    transform: translateX(2px);
  }
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}

/* Result reveal: parts fade up in reading order, 80 ms apart. */
.reveal > * {
  animation: fadeUp var(--t-slow) var(--e-out) both;
}
.reveal > *:nth-child(2) {
  animation-delay: 80ms;
}
.reveal > *:nth-child(3) {
  animation-delay: 160ms;
}
.reveal > *:nth-child(4) {
  animation-delay: 240ms;
}
.shake-once {
  animation: shake 320ms var(--e-out);
}
.draw-once path {
  stroke-dasharray: 260;
  stroke-dashoffset: 260;
  animation: draw 1.4s var(--e-in-out) forwards;
}

/* Route changes: a short slide and cross-fade (React <ViewTransition>). */
::view-transition-old(main-content) {
  animation: var(--t-base) var(--e-out) both vt-out;
}
::view-transition-new(main-content) {
  animation: var(--t-base) var(--e-out) both vt-in;
}
@keyframes vt-out {
  to {
    opacity: 0;
    transform: translateX(-16px);
  }
}
@keyframes vt-in {
  from {
    opacity: 0;
    transform: translateX(16px);
  }
}
```

`components/result/result-card.tsx`: replace the wrapper class
`motion-safe:[&>*]:animate-[fadeUp_var(--t-slow)_var(--e-out)_both]` with
`reveal`. Inside the `<article>`, wrap the header row, the title, the
summary and the steps in `<div className="reveal">`. Diagnosis text only
fades with its block; it is never animated on its own.

`components/form/consultation-form.tsx`: add `shake-once` to an input's
class when it has an error _and_ the user has just pressed Analyse. Keep a
`submitCount` state and use `key={submitCount}` on each field wrapper with
an error, so the shake replays on each failed submit:

```tsx
const [submitCount, setSubmitCount] = useState(0);
// in submit(), before setErrors(r.errors):
setSubmitCount((n) => n + 1);
// on the Age input (same pattern for the question textarea):
<input key={errors.age ? `age-${submitCount}` : "age"} … className={cn(input, "font-mono tabular", errors.age ? cn(bad, "shake-once") : "border-lilac-2")} />
```

`components/states/first-visit.tsx`: add the brand mark drawing itself
once, above the heading:

```tsx
<svg
  aria-hidden
  viewBox="0 0 58 52"
  className="draw-once mx-auto mb-2 h-14 w-auto"
>
  <defs>
    <linearGradient id="fv-m" x1="0" x2="1">
      <stop offset=".5" stopColor="#15999E" />
      <stop offset=".75" stopColor="#5a3a78" />
      <stop offset="1" stopColor="#6b2a68" />
    </linearGradient>
  </defs>
  <path
    d="M2 30 C5 28 7 29 8 31 C9 33 11 31 12 29 L22 15 C24 13 25 15 24 18 L18 46 C17 49 20 49 21 46 L35 6 C36 3 39 4 38 8 L30 46 C29 49 32 49 33 46 L46 14 C47 11 50 12 49 16 L45 40 C44 46 49 48 53 45"
    fill="none"
    stroke="url(#fv-m)"
    strokeWidth="2.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  />
</svg>
```

`components/result/result-skeleton.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";

/** Shown only if loading takes longer than 200 ms (spec §3 Motion). */
export function ResultSkeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div
      aria-busy="true"
      aria-label="Loading result"
      className="card-v3 mx-auto max-w-[700px] p-6"
    >
      <div className="flex justify-between">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
      <Skeleton className="mb-3.5 mt-4 h-10 w-3/5" />
      <Skeleton className="my-2 h-3.5" />
      <Skeleton className="my-2 h-3.5 w-11/12" />
      <Skeleton className="my-2 h-3.5 w-3/4" />
    </div>
  );
}
```

`components/consultation/consultation-view.tsx`: when
`st.status === "completed" && !result.data && !result.isError`, render
`<ResultSkeleton />` in place of `<ProcessingView>`.

`app/(clinical)/layout.tsx`: wrap the page content for the route
transition:

```tsx
import { ViewTransition } from "react";
import { AppShell } from "@/components/shell/app-shell";

export default function ClinicalLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell>
      <ViewTransition name="main-content">{children}</ViewTransition>
    </AppShell>
  );
}
```

If `typecheck` reports that `ViewTransition` isn't exported, check the
installed React version against the guide, which says React 19.3 includes
it. Don't install a canary build. Instead drop the wrapper and record it in
the PR's "What wasn't verified" section.

- [ ] **Step 4: Run the tests, then check motion by eye**

Run: `npx vitest run && npm run lint && npm run typecheck`. Expected: PASS.

Then compare against `design/v3/motion.html`:

- the result reveal order;
- the analysing steps;
- the source-tag highlight;
- the toast;
- the mobile sheet;
- the shake on an invalid age.

Turn on the OS "reduce motion" setting and check that all of it becomes
instant.

- [ ] **Step 5: Commit**

```bash
git add app components lib/motion.test.ts
git commit -m "Add motion: result reveal, skeleton, error shake and transitions"
```

---

### Task 14: End-to-end acceptance, CI and docs

**Files:**

- Create: `playwright.config.ts`, `tests/e2e/clinical-flow.spec.ts`
- Modify: `.github/workflows/ci.yml`, `README.md`, `CHANGELOG.md`, `.gitignore`

**Interfaces:**

- Consumes: the whole app in mock mode.

- [ ] **Step 1: Write the acceptance tests**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://localhost:3100",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_USE_MOCK: "true" },
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
```

`tests/e2e/clinical-flow.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

const FORBIDDEN =
  /trust score|\bNLI\b|entropy|REGENERATE|ESCALATE|\bPASS\b|guardrail/;

async function ask(page: Page, question: string) {
  await page.goto("/");
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("54");
  await page.getByRole("radio", { name: "Male" }).click();
  await page.getByRole("radio", { name: /Urgent/ }).click();
  const mobile = (page.viewportSize()?.width ?? 1440) < 768;
  if (mobile) await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Presenting symptoms").fill("Chest pain");
  await page.getByLabel("Presenting symptoms").press("Enter");
  await page.getByLabel("Clinical question").fill(question);
  if (mobile) await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: /Analyse/ }).click();
  await expect(page.getByText("Analysing your question")).toBeVisible();
}

test.afterEach(async ({ page }) => {
  // No patient data in browser storage, ever.
  const stored = await page.evaluate(
    () => localStorage.length + sessionStorage.length,
  );
  expect(stored).toBe(0);
  await expect(page.locator("body")).not.toContainText(FORBIDDEN);
});

test("high confidence result with evidence and agreement", async ({ page }) => {
  await ask(
    page,
    "Central chest pain 40 min radiating to the left arm. Diagnosis?",
  );
  await expect(
    page.getByRole("heading", { name: "Unstable angina" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("status", { name: /High confidence/ }),
  ).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole("button", { name: /Evidence & safety/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Evidence and safety" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
  } else {
    await expect(
      page.getByRole("complementary", { name: "Evidence and safety" }),
    ).toContainText("4 of 4 claims verified");
  }
  await page.getByRole("button", { name: /I agree/ }).click();
  await expect(page.getByText(/your agreement was recorded/)).toBeVisible();
});

test("use with caution shows the amber banner and accepts a correction", async ({
  page,
}) => {
  await ask(page, "Fever 3 days and rash, dengue area. Admit?");
  await expect(page.getByRole("alert").first()).toContainText(
    "Use with caution",
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: /Suggest correction/ }).click();
  await page
    .getByLabel(/What should the diagnosis/)
    .fill("Admit on warning signs");
  await page.getByLabel(/Why\?/).fill("WHO 2024 section 3.2");
  await page.getByRole("button", { name: "Submit correction" }).click();
  await expect(page.getByText(/sent for review/)).toBeVisible();
});

test("needs review: red banner, no confidence level", async ({ page }) => {
  await ask(page, "Potassium 2.9 on routine bloods. Plan?");
  await expect(page.getByRole("alert").first()).toContainText(
    "needs clinician review",
    { timeout: 20_000 },
  );
  await expect(page.getByRole("status", { name: /confidence/i })).toHaveCount(
    0,
  );
  await expect(page.getByText(/reduced-accuracy mode/)).toBeVisible();
});

test("couldn't complete keeps the question for editing", async ({ page }) => {
  await ask(page, "Please fail this request for testing.");
  await expect(
    page.getByRole("heading", { name: "We couldn't complete this one" }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Edit question" }).click();
  await expect(page.getByLabel("Clinical question")).toHaveValue(
    "Please fail this request for testing.",
  );
});

test("form errors are explained and nothing is lost", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Start a consultation/ }).click();
  await page.getByLabel("Age").fill("154");
  await page
    .getByRole("button", { name: /Analyse|Next/ })
    .last()
    .click();
  if ((page.viewportSize()?.width ?? 1440) >= 768) {
    await expect(page.getByRole("alert")).toContainText("need fixing");
    await expect(page.getByText("Must be 0–120")).toBeVisible();
  }
  await expect(page.getByLabel("Age")).toHaveValue("154");
});
```

On mobile, the Next button doesn't validate. Only Analyse does, on step 3,
so the last test checks the mobile error summary only on desktop. On
mobile, pressing Analyse on step 3 jumps back to step 1 with the error
shown. That's already covered by the form unit test.

- [ ] **Step 2: Run them**

```bash
npx playwright install chromium
npm run e2e
```

Expected: 5 tests × 2 projects PASS. Fix the app, not the tests, if a
safety or wording assertion fails.

- [ ] **Step 3: Add e2e to CI**

In `.github/workflows/ci.yml`, after the `Build` step:

```yaml
- name: E2E (mock mode)
  run: |
    npx playwright install --with-deps chromium
    npm run e2e
  env:
    NEXT_PUBLIC_USE_MOCK: "true"
```

Add `playwright-report/` and `test-results/` to `.gitignore`.

- [ ] **Step 4: Update the docs**

In `README.md`, under "Commands", add:

````markdown
### Run on mock data (Plan 1)

```bash
cp .env.example .env.local   # NEXT_PUBLIC_USE_MOCK=true
npm run dev
```

The question text picks the mock result: "fever" → Use with caution,
"potassium" → Needs review, "fail" → Couldn't complete, anything else →
High confidence.

```bash
npm test        # unit tests
npm run e2e     # end-to-end, desktop and mobile
```
````

In `CHANGELOG.md`, under _Unreleased → Added_:

```markdown
- Clinical flow on mock data (design v3): consultation form, analysing
  view, the four result states, evidence panel and mobile sheet,
  feedback and corrections, export and print, first visit, failure,
  offline, idle timeout and unsaved-draft states, ⌘K search, keyboard
  shortcuts, help, and motion with reduced-motion support.
```

- [ ] **Step 5: Run everything, then commit**

Run: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run build && npm run e2e`
Expected: all PASS.

```bash
git add -A playwright.config.ts tests/e2e .github/workflows/ci.yml README.md CHANGELOG.md .gitignore
git commit -m "Add end-to-end acceptance tests and run them in CI"
```

Open a PR titled "Plan 1: clinical flow on mock data (design v3)", using
the PR template, with the label `clinical-review`. Attach screenshots
taken in mock mode at 1440, 1024, 820 and 390 px.

---

### Task 15: A shareable demo for team feedback

The team (clinicians, product, alaba) uses the mock build to try the flow
and report what they think, long before the backend is ready.

**Files:**

- Create: `components/states/demo-ribbon.tsx`, `components/states/demo-ribbon.test.tsx`, `lib/feedback-link.ts`, `lib/feedback-link.test.ts`, `.github/ISSUE_TEMPLATE/design-feedback.yml`
- Modify: `components/shell/app-shell.tsx` (render the ribbon), `README.md` (a "Share the demo" section)

**Interfaces:**

- Consumes: `NEXT_PUBLIC_USE_MOCK` (Task 5), `usePathname`.
- Produces:
  - `feedbackUrl(page: string, viewport: string): string`, a pre-filled GitHub issue link. It contains **no result text or form content**, only the page path and the screen size;
  - `<DemoRibbon />`, rendered only when `NEXT_PUBLIC_USE_MOCK === "true"`.

**Rules:**

- **Every screen says it's a demo:** a slim ribbon reads "Demo · sample
  data, not for clinical use", so screenshots can't be mistaken for real
  advice.
- **Feedback never carries what was typed or shown:** reviewers describe
  it in their own words. The ribbon doesn't send anything itself; it opens
  a GitHub issue form.
- **The preview is private:** behind deployment protection or the team's
  SSO, never public. Deploying is an outward-facing step, so **the
  product owner approves the host before the first deploy**.

- [ ] **Step 1: Write the failing tests**

`lib/feedback-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { feedbackUrl } from "./feedback-link";

describe("feedbackUrl", () => {
  it("opens the design-feedback issue form with page and viewport only", () => {
    const u = new URL(feedbackUrl("/c/mock-1-abc", "390×844"));
    expect(u.origin + u.pathname).toBe(
      "https://github.com/Measured-Health/mhai-web/issues/new",
    );
    expect(u.searchParams.get("template")).toBe("design-feedback.yml");
    expect(u.searchParams.get("page")).toBe("/c/[id]");
    expect(u.searchParams.get("viewport")).toBe("390×844");
    expect(u.searchParams.get("labels")).toBe("design-feedback");
  });
});
```

`components/states/demo-ribbon.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
import { DemoRibbon } from "./demo-ribbon";

afterEach(() => vi.unstubAllEnvs());

describe("DemoRibbon", () => {
  it("labels the build as sample data and links to feedback", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    render(<DemoRibbon />);
    expect(
      screen.getByText(/sample data, not for clinical use/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Give feedback/ })).toHaveAttribute(
      "target",
      "_blank",
    );
  });
  it("is absent outside mock mode", () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const { container } = render(<DemoRibbon />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run lib/feedback-link.test.ts components/states/demo-ribbon.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement**

`lib/feedback-link.ts`:

```ts
/** Page path with ids masked, plus the viewport. Never form or result content. */
export function feedbackUrl(page: string, viewport: string): string {
  const u = new URL("https://github.com/Measured-Health/mhai-web/issues/new");
  u.searchParams.set("template", "design-feedback.yml");
  u.searchParams.set("labels", "design-feedback");
  u.searchParams.set("page", page.replace(/^\/(c|print)\/[^/]+/, "/$1/[id]"));
  u.searchParams.set("viewport", viewport);
  return u.toString();
}
```

`components/states/demo-ribbon.tsx`:

```tsx
"use client";
import { usePathname } from "next/navigation";
import { MessageSquarePlus } from "lucide-react";
import { feedbackUrl } from "@/lib/feedback-link";

export function DemoRibbon() {
  const path = usePathname();
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") return null;
  const vp =
    typeof window === "undefined"
      ? ""
      : `${window.innerWidth}×${window.innerHeight}`;
  return (
    <div
      role="note"
      className="flex items-center gap-3 bg-bloom px-4 py-1.5 text-[12px] text-white print:hidden md:px-[26px]"
    >
      <b className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider">
        Demo
      </b>
      <span>Demo · sample data, not for clinical use</span>
      <a
        href={feedbackUrl(path, vp)}
        target="_blank"
        rel="noreferrer"
        className="ml-auto inline-flex items-center gap-1.5 font-semibold underline-offset-2 hover:underline"
      >
        <MessageSquarePlus aria-hidden className="size-3.5" />
        Give feedback
      </a>
    </div>
  );
}
```

In `components/shell/app-shell.tsx`, render `<DemoRibbon />` as the first
child of `<main>`, above `<OfflineStrip />`.

`.github/ISSUE_TEMPLATE/design-feedback.yml`:

```yaml
name: Design feedback (demo)
description: Feedback on the MHAI demo running on sample data
labels: ["design-feedback"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for trying the demo. **Don't paste patient details**. Describe what you saw in your own words.
  - type: input
    id: page
    attributes: { label: Page, description: Filled in automatically }
  - type: input
    id: viewport
    attributes: { label: Screen size, description: Filled in automatically }
  - type: dropdown
    id: role
    attributes:
      label: Your role
      options: [Clinician, Hospital admin, Product / design, Engineering, Other]
  - type: dropdown
    id: kind
    attributes:
      label: What kind of feedback?
      options:
        [
          Something is confusing,
          Something is wrong,
          Wording,
          Missing feature,
          Looks / feel,
          Praise,
        ]
  - type: textarea
    id: what
    attributes: { label: What happened, and what did you expect? }
    validations: { required: true }
```

Create the `design-feedback` label once:

```bash
gh label create design-feedback --color 15999E --description "Feedback from the demo"
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run && npm run e2e`. Expected: PASS. The ribbon doesn't
contain any forbidden term.

- [ ] **Step 5: Document sharing the demo**

Add this to `README.md`:

```markdown
### Share the demo

The demo runs on sample data (`NEXT_PUBLIC_USE_MOCK=true`). A ribbon on
every screen says so, and its **Give feedback** link opens a GitHub issue
form. Feedback lands under the `design-feedback` label.

- **On your machine:** `npm run build && NEXT_PUBLIC_USE_MOCK=true npx next start`
- **For the team:** a private preview deployment of this branch with
  `NEXT_PUBLIC_USE_MOCK=true`. Keep previews behind access protection;
  never make them public.
```

- [ ] **Step 6: Commit**

```bash
git add components/states/demo-ribbon.tsx components/states/demo-ribbon.test.tsx lib/feedback-link.ts lib/feedback-link.test.ts .github/ISSUE_TEMPLATE/design-feedback.yml components/shell/app-shell.tsx README.md
git commit -m "Add a demo ribbon and a feedback link for team review"
```

- [ ] **Step 7: Deploy a private preview (needs the product owner's go-ahead)**

**Stop and ask the product owner** which host to use, and who gets access,
before running anything here. Deploying is outward-facing.

Once they approve, deploy the PR branch with `NEXT_PUBLIC_USE_MOCK=true`,
with access protection on. Share the link only in the team channel.
