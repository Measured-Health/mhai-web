# Plan 3: My feedback & corrections and the review queue (design v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the feedback loop that Plan 1 opened. A clinician who
suggests a correction can follow it, and a second clinician can review it:

- **My feedback & corrections:** your corrections as Waiting, Approved,
  Rejected (with the reviewer's reason) or Withdrawn; withdraw a waiting
  one; resubmit a rejected one; a toast when a decision arrives and a bell
  in the top bar with this session's decisions;
- **the review queue:** what's waiting (anything over 4 hours flagged),
  what the system said beside the suggested correction with the changes
  marked, who suggested it, why, the evidence on file and the consultation;
  Approve (with a 10-second Undo), Reject (a reason is required) and Skip,
  with A and R shortcuts; your own correction can't be approved or rejected
  by you, only withdrawn; "All caught up" with your recent decisions;
- **the sidebar entry** "Review corrections" with a waiting count;
- **the account page's "My feedback" section** with your counts.

Everything runs on sample data now and switches to the real API without UI
changes.

**Architecture:**

- **Same pattern as Plans 1 and 2.** The typed `MhaiClient`
  (`lib/api/client.ts`) gains seven correction methods. The mock
  (`lib/api/mock.ts`, data in the new `lib/api/mock-corrections.ts`) keeps
  everything in memory; the live client (`lib/api/live.ts`) calls the BFF
  proxy `/api/v1/*`, which now only forwards the correction and feedback
  shapes this plan uses.
- **TanStack Query hooks** live in the new `lib/correction-queries.ts`:
  three lists, the stats, and the reject and withdraw mutations. Polling is
  how decisions arrive (spec §10 item 1): it pauses offline and in
  background tabs and slows down on 2G or data saver.
- **Pure rules** (overdue, ages, labels, the queue order, which item comes
  next, error wording) are in `lib/corrections.ts`; the word diff is in
  `lib/word-diff.ts`. Both are unit-tested without React.
- **The 10-second undo** is one hook, `useUndoableApproval`
  (`lib/review/use-undoable-approval.ts`). The approve request is sent only
  when the window ends or the reviewer leaves (ruling R1 below).
- **Decisions arriving:** `DecisionsProvider` (inside `AppShell`, so only for
  a signed-in clinician) polls your corrections, compares each poll with the
  last one, toasts each new decision and keeps the bell's history in React
  state.
- **Screens:** `/review` (`components/review/*`) and `/my-feedback`
  (`components/corrections/*`), both inside the clinical shell and its
  `AuthGate`.

**The assumed backend contract.** Base `/api/v1`. Errors are
`problem+json` with `code`. The existing endpoints come from
`mhai-multiagent/docs/specs/2026-10-08-api-gateway-phase1-design.md` §4.1
and §5; everything marked **assumed** is new and is written into spec §10
item 1 in Task 2 so the backend team can match it or tell us what changed.

| Feature                          | Endpoint                                                                                                                                                                                                                                                                                                                               | Source                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Suggest a correction             | `POST /feedback {query_id, action: correct, corrected_diagnosis, reason}` → `{status: pending_review, correction_id}`, with `Idempotency-Key`                                                                                                                                                                                          | existing (§4.1; key from Plan 2)                                        |
| Others' waiting corrections      | `GET /corrections?status=pending` → `CorrectionOut[]` (never your own)                                                                                                                                                                                                                                                                 | existing; the **item shape is assumed**                                 |
| Approve                          | `POST /corrections/{id}/approve` → 204; **403** `self_approval` on your own                                                                                                                                                                                                                                                            | existing; 204, `Idempotency-Key` and `keepalive` use are **assumed**    |
| A correction, as the API returns | `CorrectionOut`: `id`, `query_id`, `status` (`pending_review`, `approved`, `rejected`, `withdrawn`), `corrected_diagnosis`, `reason`, `submitted_by` and `decided_by` (`{display_name, full_name, specialty, hospital}`, never an id), `submitted_at`, `decided_at`, `rejection` (`{reason_code, note}`), `original`, `consultation`   | table fields exist (§5 `corrections`); the extra fields are **assumed** |
| The compare view's data          | `original`: `decision`, `degraded`, `diagnosis`, `icd10_code`, `response_text`, `citations[{source_title, claim_text, action}]`; `consultation`: `age`, `sex`, `symptoms`, `clinical_question`, `urgency`, `specialty`. Embedded because the reviewer isn't the query owner, so `GET /queries/{id}/result` (owner only) can't serve it | **assumed**                                                             |
| Reject with a reason             | `POST /corrections/{id}/reject {reason_code, note?}` → 204. `reason_code`: `not_supported`, `needs_rewording`, `unsafe`, `out_of_scope`; `note` ≤ 500 characters; **403** `self_approval`                                                                                                                                              | **assumed**                                                             |
| Withdraw your own                | `POST /corrections/{id}/withdraw` → 204; **403** `forbidden` if it isn't yours                                                                                                                                                                                                                                                         | **assumed**                                                             |
| My corrections                   | `GET /corrections/mine` → `CorrectionOut[]`, every status, newest first                                                                                                                                                                                                                                                                | **assumed**                                                             |
| My recent decisions as reviewer  | `GET /corrections/reviewed` → `CorrectionOut[]` (last 30 days, at most 50)                                                                                                                                                                                                                                                             | **assumed**                                                             |
| Feedback stats                   | `GET /feedback/stats/mine` → `{agreed, corrections_waiting, corrections_approved, corrections_rejected, corrections_withdrawn}`                                                                                                                                                                                                        | **assumed**                                                             |
| Someone else decided first       | **409** `already_decided` from approve, reject or withdraw on a correction that is no longer waiting; **404** `not_found` for an unknown id                                                                                                                                                                                            | **assumed**                                                             |
| Retry-safe decisions             | `Idempotency-Key` on approve, reject and withdraw, kept as long as `POST /feedback`'s (spec §10 items 15 and 19)                                                                                                                                                                                                                       | **assumed**                                                             |

**Rulings** (open points in the spec, decided here so the build can go
ahead; each is recorded in the docs by the task named):

- **R1 · When the approval is sent.** Pressing Approve starts a 10-second
  window (`UNDO_WINDOW_MS`). Nothing is sent during it, and Undo simply
  cancels. The request is sent, exactly once and with one
  `Idempotency-Key`, at the first of:
  1. the window ending;
  2. the reviewer starting another decision (Approve on the next item,
     opening Reject or Withdraw);
  3. the review page unmounting (any in-app navigation, sign-out, idle
     sign-out), sent with `keepalive`;
  4. `pagehide` (reload, closing the tab, leaving the site), sent with
     `keepalive`, because the in-memory window would be lost.

  Leaving the page therefore confirms the approval: pressing Approve was the
  decision, and the window is only a grace period. If the send fails
  (offline at that moment, a dropped connection, 409, 401), nothing was
  approved: the correction stays waiting on the server and reappears in the
  queue, and the reviewer is told if still on the page. Undo after the send
  isn't possible. Task 9 builds and tests this; Task 2 tells the backend.

- **R2 · Reject has no undo.** The reject dialog, with its required reason,
  is the confirmation; "Reject with reason" sends at once.
- **R3 · Who reviews.** Every signed-in clinician sees the queue (the
  backend lets any clinician approve another's correction). The sidebar
  entry hides when the API answers the queue with 403, and the page then
  says reviewing isn't available. "My specialty" is a filter for
  convenience, not a restriction. If the backend later limits reviewers
  (spec §11), it filters `GET /corrections` and the UI needs no change.
  Recorded in spec §11 by Task 2.
- **R4 · Your own waiting corrections are in the queue,** merged in from
  `GET /corrections/mine` and marked "Your correction", as the mockup shows.
  The sidebar badge counts only what you can decide (others' waiting
  corrections); the queue's "Waiting · N" counts every row it lists.
- **R5 · Order.** Oldest first, so overdue corrections lead; the item
  selected by default is the oldest one you can decide. After a decision
  the next one you can decide loads; your own come last.
- **R6 · What is compared.** The API's correction replaces the
  "diagnosis or recommendation" (`corrected_diagnosis`, the field the
  correction form asks for). So the compare view diffs `original.diagnosis`
  against `corrected_diagnosis`; the system's full answer and the question
  as asked are in "Open consultation".
- **R7 · "Open consultation"** opens a read-only dialog built from the
  correction's `consultation` and `original`. It doesn't link to `/c/{id}`:
  the reviewer isn't the query owner, and a full page load of `/c/{id}`
  ends at the "ended" page anyway.
- **R8 · Offline.** Approve, Reject and Withdraw are disabled with an
  explanation, and A and R do nothing. Decisions are never put in the
  offline outbox. A pending approval whose window ends offline isn't sent
  (R1). Resubmitting a rejected correction is a new `POST /feedback`, so
  it uses the existing outbox exactly as any correction does.
- **R9 · Notifications.** `DecisionsProvider` polls `GET /corrections/mine`
  every 30 s (`DECISION_POLL_MS`; 60 s on 2G or data saver), paused offline
  and in background tabs. The first answer is only a baseline, so signing
  in never toasts old decisions. The bell keeps at most 50 decisions, in
  memory, and forgets them on sign-out (the shell unmounts).
- **R10 · Placeholders are named:** `REVIEW_OVERDUE_MS` (4 h, spec §11),
  `UNDO_WINDOW_MS` (10 s), `NOTE_MAX` (500), `REVIEW_POLL_MS` (60 s),
  `DECISION_POLL_MS` (30 s).
- **R11 · Mobile.** As `mobile-account-review.html`: cards instead of the
  split view, a detail screen with Back and "1 of 3", Approve and Reject
  docked at the bottom, and the reject form as a bottom sheet. The swipe
  between items isn't built (Back, the list and Skip on larger screens do
  the same job); this stays an open point.
- **R12 · Routes:** `/review` and `/my-feedback`.

**Tech Stack:** as Plan 2 (Next.js 16.4 App Router with `cacheComponents`,
React 19.3, TanStack Query 5, Tailwind 4, `lucide-react`, Vitest + React
Testing Library + fake-indexeddb, Playwright 1.64.1). No new dependencies.

**Spec:** docs/specs/2026-10-13-ui-design-v3.md (§5.3 My corrections, §5.4 review queue, §5.5 account menu + feedback stats, §10 item 1), mockups design/v3/review-queue.html, design/v3/states-and-export.html (tab 7 · My corrections), design/v3/account.html (4 · Account menu, 5 · Profile & security "My feedback"), design/v3/mobile-account-review.html.

Also read `ARCHITECTURE.md` §4.6 (corrections need two clinicians) and
the backend design `mhai-multiagent/docs/specs/2026-10-08-api-gateway-phase1-design.md`
§4.1 (`/feedback`, `/corrections`) and §5 (the `corrections` table). The
backend's corrections endpoints beyond approve aren't built, so the live
half is tested against fake responses.

**Not in this plan:**

- **Generated OpenAPI types.** As in Plan 2, `lib/api/contract.ts` is
  written by hand until the backend commits `openapi.json`.
- **Hospital admin review oversight** (remind, assign a reviewer, overdue
  across the hospital): Plan 4, `hospital-admin.html`.
- **"We've reminded the reviewers"** (review-queue tab 3): there is no
  reminder data in the API, and the UI only shows what the API returns.
- **Swipe between items on mobile** (R11).

**Sample data (mock):** the demo signs in as any sample clinician; the
review data is written for the Dr. Reyes account (`a.reyes@…`), which signs
straight in:

- three waiting corrections from other sample clinicians (Dr. Okafor and
  Nurse Bello from `lib/auth/mock.ts`): acute asthma (6 h, over 4 hours),
  hypokalaemia (3 h, Internal Medicine, so "My specialty" has one) and
  dengue (42 min);
- your own: a waiting febrile seizure correction (5 h), an approved one and
  a rejected one with the reviewer's reason;
- one decision of yours as a reviewer (the empty state's "recent
  decisions");
- a correction you send in the demo is decided about two minutes later:
  approved, or rejected with a reason when its reason contains the word
  "unsure".

## Global Constraints

- **Read the Next.js docs before coding.** This Next.js version has
  breaking changes (AGENTS.md). Before writing a page, read
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`
  and `route-groups.md`. Notes from Plans 1 and 2 still hold:
  - route handlers use `RouteContext<'/path/[...param]'>`, and params are
    a Promise;
  - with `cacheComponents`, `useSearchParams` and `use(params)` must sit
    inside `<Suspense>`. This plan's pages use neither: selection lives in
    React state, not the URL.
- **Plain-language clinical wording; never backend terms (spec §6).** No
  "NLI", "trust score", PASS/REGENERATE/ESCALATE, KB ids, "self_approval",
  "pending_review", "already_decided" or "reason_code" values in UI text or
  accessible names. Decisions map to High confidence / Use with caution /
  Needs review (`RESULT_LABEL`), statuses to Waiting / Approved / Rejected /
  Withdrawn (`STATUS_VIEW`), reject codes to `REJECT_REASONS` labels, and
  error codes to `decisionError()` copy. Task 1 adds `pending_review` and
  `self_approval` to `FORBIDDEN_TERMS`, so the e2e word check covers them.
- **Privacy (spec §8, CONTRIBUTING).** Corrections, decisions, notes and
  the consultations shown to reviewers are clinical content. They live in
  memory only: the TanStack cache (memory-only, cleared on sign-out by
  `SessionProvider.clear()`) and React state. Never `localStorage`,
  `sessionStorage`, IndexedDB, cookies, the URL or `console.*`. The outbox
  in `lib/offline/` is the only exception and this plan doesn't change it;
  review decisions are **not** queued offline (R8). The bell's history is
  React state only. The e2e specs end with `expectNoStorage`.
- **Never send a user or clinician id from the client.** The API knows who
  you are; `submitted_by` and `decided_by` are names for display only.
- **Accessibility (spec §7):**
  - every status has a word plus an icon (`StatusChip`, `OriginalChip`,
    `OverdueChip`), never colour alone; the waiting count is a number;
  - the diff marks changes with `<del>` (struck through) and `<ins>`
    (underlined), each with a screen-reader prefix ("Removed:", "Added:"),
    and a visible legend says which is which;
  - everything is reachable by keyboard with a visible focus ring; the A
    and R shortcuts are only registered on the review page, never fire
    while typing or with a dialog open (`useShortcuts` already checks), and
    are listed in the shortcuts dialog;
  - dialogs trap focus and close on Esc; the default in the withdraw dialog
    is "Keep it" (safe); after Approve, focus moves to Undo; after Undo, back
    to Approve;
  - touch targets are at least 44 px below `sm` (`min-h-11`);
  - motion uses the tokens only and is off under reduced motion and data
    saver (`lib/motion.test.ts` scans every new file). The undo countdown is
    text, not a 10-second animation (nothing animates over 700 ms).
- **Match the design v3 mockups.** Reuse `card-v3`, the colour tokens in
  `app/globals.css`, `Button` (one new `approve` variant in Task 10),
  `Banner`, `Chip`, `Dialog`, `Sheet`, `Skeleton`, `useToast`, `TopBar` and
  `MenuButton`. Layout and spacing come from the mockup CSS (`.rq`, `.qi`,
  `.cmp`, `.why`, `.decide`, `.lockb`, `.stx`, `.pl`).
- **Long and unusual text:** correction text, reasons, notes and names wrap
  (`[overflow-wrap:anywhere]`) and are never cut off except the queue's
  two-line summary (`line-clamp-2`, full text in the detail). The diff
  tokenises on Unicode letters, marks and numbers.
- **Auth gating:** both pages sit in `app/(clinical)`, behind Plan 2's
  `AuthGate` (signed-in clinicians who finished first sign-in only). The
  BFF still forwards clinical calls for clinicians only. A 401 from any new
  call goes through `reportUnauthorized()`, which signs out once with
  "Your session ended" (Plan 2 Task 12).
- **Writes:** reject and withdraw carry a fresh `Idempotency-Key` per user
  action, reused on retries; retries are for network errors and 5xx only,
  and never while offline. Approvals carry one key per Approve press (R1).
- **Tests:** Vitest unit and component tests in every task; Playwright e2e
  for the review flow and My corrections on both the desktop and mobile
  projects (Task 14). E2E specs never wait on real time for the undo: they
  use `page.clock` (install before the first `goto`, then `fastForward`).
  Existing tests that stub `getClient()` with a partial object keep passing:
  the new correction queries fail quietly inside TanStack Query there and
  nothing in those tests depends on them.
- **Docs:** `CHANGELOG.md` under _Unreleased_ for user-visible changes, in
  the task that makes them; README's "Run on mock data" gains the review
  demo (Task 14); spec §10 item 1, §11 and `ARCHITECTURE.md` §4.6 (Task 2).
- **Commits:** imperative subject of at most 72 characters, **no AI
  attribution** (no co-author trailers). Work on branch
  `agent/plan-3-feedback-review`; humans merge. Never name or copy
  outside projects in code, comments, docs or commits; no "lab" wording
  anywhere.

## Review Focus

The five real-world failures this feature is most likely to meet that the
happy-path tests would miss. Each has a named test in its owning task.

1. **Someone else decides the correction while the reviewer is mid-reject.**
   The 60-second poll drops it from the queue, or "Reject with reason"
   meets a 409. Expected: the view doesn't jump away from the reviewer; the
   reject dialog stays open with the note intact, says "Another clinician
   has already decided this correction" and disables sending; after
   closing, the detail keeps the same correction with the same notice and a
   "Next correction" button. Tests: Task 8 ("stays open with the note when
   the correction is decided elsewhere"), Task 11 ("someone else decides it
   while you're rejecting").
2. **Undo racing navigation, reload or the next decision.** The reviewer
   presses Approve, then clicks a sidebar link, reloads, presses Approve on
   the next item, or presses Undo after the window. Expected: exactly one
   approve request per Approve press (one key), sent at the moment R1 says
   (with `keepalive` when leaving); Undo inside the window sends nothing;
   Undo after the send does nothing. Tests: Task 9 (all of them).
3. **The connection drops during review.** Expected: Approve, Reject and
   Withdraw disabled with "You're offline"; A and R do nothing; an approval
   whose window ends offline isn't sent, the correction comes back to the
   queue and a toast says so; nothing is queued in storage. Tests: Task 9
   ("offline at the end"), Task 11 ("offline: decisions are disabled" and
   "an approval waiting when the connection drops comes back").
4. **The API says it's your own when the UI didn't know** (403
   `self_approval`, for example a stale list or your own correction from
   another device). Expected: "This is your own correction", the item turns
   into your own (Approve and Reject disabled, Withdraw offered), never a
   generic error. Tests: Task 3 (`decisionError`), Task 11 ("a 403 from the
   API turns it into your own").
5. **Very long or unusual correction text** (2,000 characters without a
   space, emoji, accents written as combining marks, superscripts like
   10⁹/L, right-to-left text). Expected: nothing overflows its card, the
   detail shows every character, the queue clamps to two lines, and the
   diff keeps every character in order without splitting a character.
   Tests: Task 3 ("keeps every character, including emoji and combining
   marks"), Task 4 ("wraps very long and mixed-script text"), Task 10
   ("clamps a long summary in the queue").

---

## File structure

```text
lib/api/
  contract.ts               + CorrectionOut, PersonOut, RejectIn, FeedbackStatsOut, WriteOpts …
  client.ts                 + seven MhaiClient correction methods
  mock-corrections.ts       createMockCorrections(): sample corrections, memory only (new)
  mock.ts                   wires the mock corrections into createMockClient()
  live.ts                   + the correction calls (keepalive for approvals)
lib/corrections.ts          REVIEW_OVERDUE_MS, UNDO_WINDOW_MS, NOTE_MAX, REJECT_REASONS,
                            STATUS_VIEW, buildQueue, pickNext, decisionError, … (new)
lib/word-diff.ts            tokenize(), wordDiff() (new)
lib/correction-queries.ts   CORRECTION_KEYS, polling hooks, reject/withdraw mutations (new)
lib/review/use-undoable-approval.ts   the 10-second undo (new)
lib/hooks/use-media.ts      useIsDesktop() (new)
lib/labels.ts               FORBIDDEN_TERMS + pending_review, self_approval
lib/queries.ts              useFeedback refreshes the correction lists
app/api/v1/[...path]/route.ts   corrections and feedback route shapes
app/(clinical)/review/page.tsx       (new)
app/(clinical)/my-feedback/page.tsx  (new)
components/corrections/
  chips.tsx                 StatusChip, OriginalChip, OverdueChip (new)
  decisions-provider.tsx    DecisionsProvider, useDecisions, newDecisions (new)
  decision-bell.tsx         DecisionBell (new)
  withdraw-dialog.tsx       WithdrawDialog (new)
  resubmit-dialog.tsx       ResubmitDialog (new)
  my-corrections-view.tsx   MyCorrectionsView (new)
components/review/
  correction-compare.tsx    CorrectionCompare, DiffText (new)
  consultation-dialog.tsx   ConsultationDialog (new)
  reject-dialog.tsx         RejectDialog (new)
  queue-list.tsx            QueueList (new)
  review-detail.tsx         ReviewDetail (new)
  undo-notice.tsx           UndoNotice (new)
  all-caught-up.tsx         AllCaughtUp, RecentDecisions (new)
  review-view.tsx           ReviewView (new)
components/account/feedback-section.tsx   FeedbackSection (new)
components/account/account-view.tsx       + "My feedback" section
components/shell/account-menu.tsx         + "My feedback & corrections"
components/shell/sidebar.tsx              + "Review corrections" with the count
components/shell/top-bar.tsx              + DecisionBell
components/shell/app-shell.tsx            + DecisionsProvider
components/utility/shortcuts-dialog.tsx   + A and R in review
components/feedback/correction-form.tsx   + initial values (resubmit)
components/ui/button.tsx                  + approve variant
tests/corrections.ts        makeCorrection() test builder (new)
tests/e2e/review.spec.ts    review queue and My corrections, desktop and mobile (new)
```

### Task 1: Correction types, the client methods and the mock corrections

**Files:**

- Create: `lib/api/mock-corrections.ts`, `lib/api/mock-corrections.test.ts`,
  `lib/api/live-corrections.test.ts`
- Modify: `lib/api/contract.ts`, `lib/api/client.ts`, `lib/api/mock.ts`,
  `lib/api/live.ts`, `lib/labels.ts`
- Test: `lib/api/mock-corrections.test.ts`, `lib/api/live-corrections.test.ts`; the existing `lib/api/mock.test.ts`, `lib/api/live.test.ts` and `lib/labels.test.ts` must still pass

**Interfaces:**

- Consumes: `FIXTURES` (`lib/api/fixtures.ts`), `ApiError`
  (`lib/api/errors.ts`), `reportUnauthorized` (`lib/auth/events.ts`), the
  sample people's names in `lib/auth/mock.ts` (copied as display data, not
  imported, so the API mock doesn't depend on the auth mock).
- Produces:
  - **Types** (`lib/api/contract.ts`): `CorrectionStatus`,
    `RejectReasonCode`, `PersonOut`, `CorrectionOriginalOut`,
    `CorrectionConsultationOut`, `CorrectionOut`, `RejectIn`,
    `FeedbackStatsOut`, `WriteOpts`.
  - **`MhaiClient`** gains:
    - `listPendingCorrections(): Promise<CorrectionOut[]>`
    - `listMyCorrections(): Promise<CorrectionOut[]>`
    - `listMyReviews(): Promise<CorrectionOut[]>`
    - `approveCorrection(id: string, opts?: WriteOpts): Promise<void>`
    - `rejectCorrection(id: string, r: RejectIn, opts?: WriteOpts): Promise<void>`
    - `withdrawCorrection(id: string, opts?: WriteOpts): Promise<void>`
    - `getMyFeedbackStats(): Promise<FeedbackStatsOut>`
  - **Mock:** `createMockClient(opts?: { stepMs?: number; now?: () => number; decideAfterMs?: number })`;
    `createMockCorrections({ now, decideAfterMs })`,
    `MOCK_DECIDE_AFTER_MS` (120 000), `MOCK_PEOPLE`.
  - **Seeded ids** (tests and e2e rely on them): waiting from others
    `c-asthma` (6 h), `c-potassium` (3 h), `c-dengue` (42 min); yours
    `c-seizure` (waiting, 5 h), `c-nstemi` (approved), `c-vomiting`
    (rejected); reviewed by you `c-warfarin`. Each `query_id` is
    `q-<id>`.
  - **Mock errors:** approve or reject on your own →
    `ApiError(403, "self_approval")`; on one that isn't waiting →
    `ApiError(409, "already_decided")`; unknown id →
    `ApiError(404, "not_found")`; withdraw on someone else's →
    `ApiError(403, "forbidden")`.

- [ ] **Step 1: Write the failing tests**

`lib/api/mock-corrections.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { createMockClient } from "./mock";
import { MOCK_DECIDE_AFTER_MS, MOCK_PEOPLE } from "./mock-corrections";

const H = 3_600_000;
const q = (text: string) => ({
  patient_data: { age: 54, sex: "male" as const, symptoms: ["Chest pain"] },
  clinical_question: text,
  urgency: "urgent" as const,
});
const fail = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("expected a rejection");
};

describe("mock corrections", () => {
  it("lists others' waiting corrections, never your own", async () => {
    const c = createMockClient({ now: () => 10 * H });
    const pending = await c.listPendingCorrections();
    expect(pending.map((x) => x.id).sort()).toEqual([
      "c-asthma",
      "c-dengue",
      "c-potassium",
    ]);
    expect(pending.every((x) => x.status === "pending_review")).toBe(true);
    const mine = await c.listMyCorrections();
    expect(pending.some((p) => mine.some((m) => m.id === p.id))).toBe(false);
  });

  it("has sample people, one waiting over 4 hours, and yours in every state", async () => {
    const c = createMockClient({ now: () => 10 * H });
    const pending = await c.listPendingCorrections();
    expect(new Set(pending.map((x) => x.submitted_by.display_name))).toEqual(
      new Set([
        MOCK_PEOPLE.okafor.display_name,
        MOCK_PEOPLE.bello.display_name,
      ]),
    );
    expect(
      pending.some((x) => 10 * H - Date.parse(x.submitted_at) > 4 * H),
    ).toBe(true);
    const mine = await c.listMyCorrections();
    expect(new Set(mine.map((x) => x.status))).toEqual(
      new Set(["pending_review", "approved", "rejected"]),
    );
    const rejected = mine.find((x) => x.status === "rejected")!;
    expect(rejected.rejection?.reason_code).toBe("needs_rewording");
    expect(rejected.rejection?.note).toMatch(/cause unclear/);
    expect(rejected.decided_by?.display_name).toBe("Nurse Bello");
    expect(mine.find((x) => x.id === "c-seizure")?.status).toBe(
      "pending_review",
    );
  });

  it("approves and rejects others' corrections, and refuses your own", async () => {
    const c = createMockClient({ now: () => 10 * H });
    await c.approveCorrection("c-dengue");
    await c.rejectCorrection("c-potassium", {
      reason_code: "unsafe",
      note: "  Too fast.  ",
    });
    expect((await c.listPendingCorrections()).map((x) => x.id)).toEqual([
      "c-asthma",
    ]);
    const reviewed = await c.listMyReviews();
    expect(reviewed.find((x) => x.id === "c-potassium")?.rejection).toEqual({
      reason_code: "unsafe",
      note: "Too fast.",
    });
    expect(reviewed.find((x) => x.id === "c-dengue")?.status).toBe("approved");
    expect(await fail(c.approveCorrection("c-seizure"))).toMatchObject({
      status: 403,
      code: "self_approval",
    });
    expect(
      await fail(c.rejectCorrection("c-seizure", { reason_code: "unsafe" })),
    ).toMatchObject({ status: 403, code: "self_approval" });
    expect(await fail(c.approveCorrection("c-dengue"))).toMatchObject({
      status: 409,
      code: "already_decided",
    });
    expect(await fail(c.approveCorrection("nope"))).toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("withdraws only your own waiting correction", async () => {
    const c = createMockClient({ now: () => 10 * H });
    await c.withdrawCorrection("c-seizure");
    expect(
      (await c.listMyCorrections()).find((x) => x.id === "c-seizure")?.status,
    ).toBe("withdrawn");
    expect(await fail(c.withdrawCorrection("c-seizure"))).toMatchObject({
      status: 409,
    });
    expect(await fail(c.withdrawCorrection("c-dengue"))).toMatchObject({
      status: 403,
      code: "forbidden",
    });
  });

  it("adds a correction you send to your list, then decides it later", async () => {
    let t = 0;
    const c = createMockClient({ stepMs: 10, now: () => t });
    const { query_id } = await c.createQuery(q("Fever and rash, dengue?"));
    const sent = await c.sendFeedback({
      query_id,
      action: "correct",
      corrected_diagnosis: "Dengue with warning signs",
      reason: "Persistent vomiting",
    });
    expect(sent.status).toBe("pending_review");
    const added = (await c.listMyCorrections()).find(
      (x) => x.id === sent.correction_id,
    );
    expect(added).toMatchObject({
      status: "pending_review",
      query_id,
      corrected_diagnosis: "Dengue with warning signs",
      original: { diagnosis: "Dengue fever, likely", decision: "REGENERATE" },
      consultation: { clinical_question: "Fever and rash, dengue?", age: 54 },
    });
    t = MOCK_DECIDE_AFTER_MS - 1;
    expect(
      (await c.listMyCorrections()).find((x) => x.id === sent.correction_id)
        ?.status,
    ).toBe("pending_review");
    t = MOCK_DECIDE_AFTER_MS;
    expect(
      (await c.listMyCorrections()).find((x) => x.id === sent.correction_id),
    ).toMatchObject({
      status: "approved",
      decided_by: { display_name: "Dr. Okafor" },
    });
  });

  it("rejects a sent correction whose reason says unsure, with a reason", async () => {
    let t = 0;
    const c = createMockClient({ now: () => t, decideAfterMs: 5 });
    const sent = await c.sendFeedback({
      query_id: "unknown",
      action: "correct",
      corrected_diagnosis: "abc",
      reason: "Unsure about this",
    });
    t = 5;
    const row = (await c.listMyCorrections()).find(
      (x) => x.id === sent.correction_id,
    )!;
    expect(row.status).toBe("rejected");
    expect(row.rejection?.reason_code).toBe("needs_rewording");
    expect(row.original.diagnosis).toBeNull();
  });

  it("counts your feedback", async () => {
    const c = createMockClient({ now: () => 10 * H });
    expect(await c.getMyFeedbackStats()).toEqual({
      agreed: 42,
      corrections_waiting: 1,
      corrections_approved: 1,
      corrections_rejected: 1,
      corrections_withdrawn: 0,
    });
    await c.sendFeedback({ query_id: "q", action: "validate" });
    await c.withdrawCorrection("c-seizure");
    expect(await c.getMyFeedbackStats()).toMatchObject({
      agreed: 43,
      corrections_waiting: 0,
      corrections_withdrawn: 1,
    });
  });

  it("hands out copies, so callers can't change the store", async () => {
    const c = createMockClient({ now: () => 10 * H });
    const [first] = await c.listPendingCorrections();
    first!.corrected_diagnosis = "changed";
    const again = await c.listPendingCorrections();
    expect(again.find((x) => x.id === first!.id)?.corrected_diagnosis).not.toBe(
      "changed",
    );
  });

  it("keeps corrections in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const c = createMockClient({ now: () => 10 * H });
    await c.listPendingCorrections();
    await c.approveCorrection("c-dengue");
    await c.listMyCorrections();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
```

`lib/api/live-corrections.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { onUnauthorized } from "../auth/events";
import { createLiveClient } from "./live";

const reply = (status: number, body?: unknown) =>
  vi.fn(async () =>
    body === undefined
      ? new Response(null, { status })
      : Response.json(body, { status }),
  );
const call = (f: ReturnType<typeof reply>, i = 0) =>
  f.mock.calls[i] as unknown as [string, RequestInit];

describe("live corrections client", () => {
  it("reads the lists and the stats from the assumed endpoints", async () => {
    const fetchImpl = reply(200, []);
    const c = createLiveClient({ fetchImpl });
    await c.listPendingCorrections();
    await c.listMyCorrections();
    await c.listMyReviews();
    expect(fetchImpl.mock.calls.map((_, i) => call(fetchImpl, i)[0])).toEqual([
      "/api/v1/corrections?status=pending",
      "/api/v1/corrections/mine",
      "/api/v1/corrections/reviewed",
    ]);
    const stats = reply(200, { agreed: 1 });
    expect(
      await createLiveClient({ fetchImpl: stats }).getMyFeedbackStats(),
    ).toEqual({ agreed: 1 });
    expect(call(stats)[0]).toBe("/api/v1/feedback/stats/mine");
  });

  it("posts decisions with an idempotency key, encoding the id", async () => {
    const fetchImpl = reply(204);
    const c = createLiveClient({ fetchImpl });
    await c.approveCorrection("a/b", { idempotencyKey: "k-1" });
    await c.rejectCorrection(
      "c1",
      { reason_code: "unsafe", note: "Too fast" },
      { idempotencyKey: "k-2" },
    );
    await c.withdrawCorrection("c2", { idempotencyKey: "k-3" });
    const [u1, i1] = call(fetchImpl, 0);
    expect(u1).toBe("/api/v1/corrections/a%2Fb/approve");
    expect(i1).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      headers: { "Idempotency-Key": "k-1" },
    });
    expect(i1.body).toBeUndefined();
    const [u2, i2] = call(fetchImpl, 1);
    expect(u2).toBe("/api/v1/corrections/c1/reject");
    expect(JSON.parse(String(i2.body))).toEqual({
      reason_code: "unsafe",
      note: "Too fast",
    });
    expect(call(fetchImpl, 2)[0]).toBe("/api/v1/corrections/c2/withdraw");
    for (const i of [0, 1, 2])
      expect(String(call(fetchImpl, i)[1].body ?? "")).not.toMatch(
        /user_id|clinician_id|submitted_by/,
      );
  });

  it("sends keepalive only when asked (a decision made while leaving)", async () => {
    const fetchImpl = reply(204);
    const c = createLiveClient({ fetchImpl });
    await c.approveCorrection("c1", { idempotencyKey: "k", keepalive: true });
    expect(call(fetchImpl, 0)[1].keepalive).toBe(true);
    await c.approveCorrection("c1");
    expect(call(fetchImpl, 1)[1].keepalive).toBeUndefined();
  });

  it("passes the API's refusal codes through", async () => {
    const own = createLiveClient({
      fetchImpl: reply(403, { code: "self_approval" }),
    });
    await expect(own.approveCorrection("c1")).rejects.toMatchObject({
      status: 403,
      code: "self_approval",
    });
    const gone = createLiveClient({
      fetchImpl: reply(409, { code: "already_decided" }),
    });
    await expect(
      gone.rejectCorrection("c1", { reason_code: "unsafe" }),
    ).rejects.toMatchObject({ status: 409, code: "already_decided" });
  });

  it("reports an expired session once from a decision", async () => {
    const seen = vi.fn();
    const off = onUnauthorized(seen);
    const c = createLiveClient({
      fetchImpl: reply(401, { code: "session_expired" }),
    });
    await expect(c.withdrawCorrection("c1")).rejects.toMatchObject({
      status: 401,
    });
    expect(seen).toHaveBeenCalledTimes(1);
    off();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/api/mock-corrections.test.ts lib/api/live-corrections.test.ts`
Expected: FAIL. The import of `./mock-corrections` can't be resolved, and
`c.listPendingCorrections is not a function` in the live tests.

- [ ] **Step 3: Add the types**

Append to `lib/api/contract.ts`:

```ts
// ── Corrections (Plan 3). Fields beyond the backend's `corrections` table
// are the assumed contract in spec §10 item 1. ──

/** `withdrawn` and `rejected` are assumed; the table has the other two. */
export type CorrectionStatus =
  "pending_review" | "approved" | "rejected" | "withdrawn";

export type RejectReasonCode =
  "not_supported" | "needs_rewording" | "unsafe" | "out_of_scope";

/** A person as the API shows them: never an id (CONTRIBUTING). */
export interface PersonOut {
  display_name: string;
  full_name: string | null;
  specialty: string | null;
  hospital: string | null;
}

/** What the system said, embedded because the reviewer can't load the result. */
export interface CorrectionOriginalOut {
  decision: ClinicalResultOut["decision"];
  degraded: boolean;
  diagnosis: string | null;
  icd10_code: string | null;
  response_text: string;
  citations: Pick<Citation, "source_title" | "claim_text" | "action">[];
}

/** The consultation as it was asked (patient details already masked). */
export interface CorrectionConsultationOut {
  age: number;
  sex: Sex;
  symptoms: string[];
  clinical_question: string;
  urgency: Urgency;
  specialty: string | null;
}

export interface CorrectionOut {
  id: string;
  query_id: string;
  status: CorrectionStatus;
  corrected_diagnosis: string;
  reason: string;
  submitted_by: PersonOut;
  /** ISO 8601. */
  submitted_at: string;
  original: CorrectionOriginalOut;
  consultation: CorrectionConsultationOut;
  decided_by: PersonOut | null;
  /** ISO 8601; also set when withdrawn. */
  decided_at: string | null;
  rejection: { reason_code: RejectReasonCode; note: string | null } | null;
}

export interface RejectIn {
  reason_code: RejectReasonCode;
  /** At most 500 characters; omitted when empty. */
  note?: string;
}

export interface FeedbackStatsOut {
  agreed: number;
  corrections_waiting: number;
  corrections_approved: number;
  corrections_rejected: number;
  corrections_withdrawn: number;
}

/** Options for a write that may be retried or sent while leaving the page. */
export interface WriteOpts {
  idempotencyKey?: string;
  keepalive?: boolean;
}
```

- [ ] **Step 4: Extend the client interface**

Replace `lib/api/client.ts` with:

```ts
import type {
  ClinicalResultOut,
  CorrectionOut,
  FeedbackIn,
  FeedbackOut,
  FeedbackStatsOut,
  QueryCreateIn,
  QueryStatusOut,
  Readiness,
  RejectIn,
  WriteOpts,
} from "./contract";
import { createLiveClient } from "./live";
import { createMockClient } from "./mock";

export interface MhaiClient {
  createQuery(
    q: QueryCreateIn,
    opts?: { idempotencyKey?: string },
  ): Promise<{ query_id: string }>;
  getStatus(id: string): Promise<QueryStatusOut>;
  getResult(id: string): Promise<ClinicalResultOut>;
  sendFeedback(
    f: FeedbackIn,
    opts?: { idempotencyKey?: string },
  ): Promise<FeedbackOut>;
  getReadiness(): Promise<Readiness>;
  /** Others' waiting corrections; the API never lists your own here. */
  listPendingCorrections(): Promise<CorrectionOut[]>;
  /** Your own corrections, every status, newest first. */
  listMyCorrections(): Promise<CorrectionOut[]>;
  /** Corrections you decided as a reviewer, newest first. */
  listMyReviews(): Promise<CorrectionOut[]>;
  approveCorrection(id: string, opts?: WriteOpts): Promise<void>;
  rejectCorrection(id: string, r: RejectIn, opts?: WriteOpts): Promise<void>;
  withdrawCorrection(id: string, opts?: WriteOpts): Promise<void>;
  getMyFeedbackStats(): Promise<FeedbackStatsOut>;
}

let client: MhaiClient | undefined;

/** Mock data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getClient(): MhaiClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockClient()
      : createLiveClient());
}
```

- [ ] **Step 5: Write the mock corrections**

`lib/api/mock-corrections.ts`:

```ts
import type {
  ClinicalResultOut,
  CorrectionConsultationOut,
  CorrectionOriginalOut,
  CorrectionOut,
  CorrectionStatus,
  FeedbackStatsOut,
  PersonOut,
  RejectIn,
  Sex,
  Urgency,
} from "./contract";
import { ApiError } from "./errors";

/** A correction you send in the demo gets a decision this long after. */
export const MOCK_DECIDE_AFTER_MS = 120_000;

const MIN = 60_000;
const H = 60 * MIN;

/** The sample people of lib/auth/mock.ts, as the API would show them. */
export const MOCK_PEOPLE = {
  okafor: {
    display_name: "Dr. Okafor",
    full_name: "Dr. Chidi Okafor",
    specialty: "Paediatrics",
    hospital: "Havana Hospital",
  },
  bello: {
    display_name: "Nurse Bello",
    full_name: "Amina Bello",
    specialty: "General ward",
    hospital: "Havana Hospital",
  },
  reyes: {
    display_name: "Dr. Reyes",
    full_name: "Dr. Ana Reyes",
    specialty: "Internal Medicine",
    hospital: "Havana Hospital",
  },
} satisfies Record<string, PersonOut>;

/** One stored correction plus who it belongs to (never sent to the UI). */
interface Row {
  c: CorrectionOut;
  /** Submitted by the signed-in person. */
  mine: boolean;
  /** Decided by the signed-in person. */
  reviewedByMe: boolean;
  /** Sent in this demo session: decided after `decideAfterMs`. */
  auto: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();

const consult = (
  age: number,
  sex: Sex,
  symptoms: string[],
  clinical_question: string,
  urgency: Urgency,
  specialty: string,
): CorrectionConsultationOut => ({
  age,
  sex,
  symptoms,
  clinical_question,
  urgency,
  specialty,
});

const said = (
  decision: ClinicalResultOut["decision"],
  diagnosis: string,
  icd10_code: string | null,
  response_text: string,
  citations: CorrectionOriginalOut["citations"],
): CorrectionOriginalOut => ({
  decision,
  degraded: false,
  diagnosis,
  icd10_code,
  response_text,
  citations,
});

interface Seed {
  id: string;
  at: number;
  by: PersonOut;
  corrected: string;
  reason: string;
  original: CorrectionOriginalOut;
  consultation: CorrectionConsultationOut;
  status?: CorrectionStatus;
  decided?: { by: PersonOut; at: number };
  rejection?: CorrectionOut["rejection"];
}

function make(s: Seed): CorrectionOut {
  return {
    id: s.id,
    query_id: `q-${s.id}`,
    status: s.status ?? "pending_review",
    corrected_diagnosis: s.corrected,
    reason: s.reason,
    submitted_by: s.by,
    submitted_at: iso(s.at),
    original: s.original,
    consultation: s.consultation,
    decided_by: s.decided?.by ?? null,
    decided_at: s.decided ? iso(s.decided.at) : null,
    rejection: s.rejection ?? null,
  };
}

const row = (s: Seed, flags: Partial<Omit<Row, "c">> = {}): Row => ({
  c: make(s),
  mine: false,
  reviewedByMe: false,
  auto: false,
  ...flags,
});

/** Synthetic sample corrections, timed relative to `t` (no real patients). */
function seed(t: number): Row[] {
  const { okafor, bello, reyes } = MOCK_PEOPLE;
  return [
    row({
      id: "c-asthma",
      at: t - 6 * H,
      by: okafor,
      corrected: "Acute asthma, severe",
      reason:
        "SpO2 under 92% and unable to complete sentences make this severe under BTS/SIGN.",
      original: said(
        "PASS",
        "Acute asthma, moderate",
        "J45.9",
        "Moderate acute asthma.\n- Salbutamol by spacer, 10 puffs\n- Oral prednisolone",
        [
          {
            source_title: "BTS/SIGN Asthma Guideline 2019",
            claim_text: "Salbutamol by spacer, 10 puffs",
            action: "PASS",
          },
        ],
      ),
      consultation: consult(
        7,
        "male",
        ["Wheeze", "Shortness of breath"],
        "Wheeze, SpO2 91%, can't finish sentences. How severe?",
        "emergency",
        "Paediatrics",
      ),
    }),
    row({
      id: "c-potassium",
      at: t - 3 * H,
      by: bello,
      corrected: "Hypokalaemia, likely from diuretic use",
      reason:
        "On furosemide 80 mg daily. Give at most 10 mmol an hour through a peripheral line.",
      original: said(
        "ESCALATE",
        "Hypokalaemia, cause unclear",
        "E87.6",
        "Low potassium on routine bloods.\n- IV potassium 40 mmol over 1 hour via a peripheral line",
        [
          {
            source_title: "BNF: Potassium chloride",
            claim_text:
              "IV potassium 40 mmol over 1 hour via a peripheral line",
            action: "REDACT",
          },
        ],
      ),
      consultation: consult(
        67,
        "male",
        ["Weakness"],
        "Potassium 2.9 on routine bloods. Plan?",
        "routine",
        "Internal Medicine",
      ),
    }),
    row({
      id: "c-dengue",
      at: t - 42 * MIN,
      by: okafor,
      corrected: "Dengue fever with warning signs: admit",
      reason:
        "Persistent vomiting and abdominal pain are warning signs. WHO 2024 admits on warning signs, not on a platelet cut-off alone.",
      original: said(
        "REGENERATE",
        "Dengue fever, likely",
        "A90",
        "Febrile illness with rash in an endemic area.\n- Admit if platelets fall below 100 × 10⁹/L",
        [
          {
            source_title: "WHO Dengue Guidelines 2024",
            claim_text: "NS1 antigen test and full blood count",
            action: "PASS",
          },
          {
            source_title: "WHO Dengue Guidelines 2024",
            claim_text: "Admit if platelets fall below 100 × 10⁹/L",
            action: "FLAG",
          },
        ],
      ),
      consultation: consult(
        24,
        "female",
        ["Fever", "Rash"],
        "Fever 3 days and rash, dengue area. Admit?",
        "urgent",
        "Infectious disease",
      ),
    }),
    row(
      {
        id: "c-seizure",
        at: t - 5 * H,
        by: reyes,
        corrected: "Febrile seizure, complex",
        reason: "It lasted 18 minutes. Over 15 minutes makes it complex.",
        original: said(
          "REGENERATE",
          "Febrile seizure, simple",
          "R56.0",
          "Seizure with fever in a young child.\n- Treat the fever and look for its source",
          [
            {
              source_title: "NICE Fever in under 5s",
              claim_text: "Treat the fever and look for its source",
              action: "PASS",
            },
          ],
        ),
        consultation: consult(
          3,
          "female",
          ["Seizure", "Fever"],
          "Febrile child, seizure for 18 minutes. Simple or complex?",
          "urgent",
          "Paediatrics",
        ),
      },
      { mine: true },
    ),
    row(
      {
        id: "c-nstemi",
        at: t - 26 * H,
        by: reyes,
        corrected: "NSTEMI",
        reason: "Troponin rose on the repeat test at 3 hours.",
        original: said(
          "PASS",
          "Unstable angina",
          "I20.0",
          "Acute coronary syndrome likely.\n- Serial high-sensitivity troponin at 0 and 3 hours",
          [
            {
              source_title: "ESC 2023 ACS Guideline",
              claim_text: "Serial high-sensitivity troponin at 0 and 3 hours",
              action: "PASS",
            },
          ],
        ),
        consultation: consult(
          54,
          "male",
          ["Chest pain"],
          "Central chest pain 40 min radiating to the left arm. Diagnosis?",
          "urgent",
          "Cardiology",
        ),
        status: "approved",
        decided: { by: okafor, at: t - 20 * H },
      },
      { mine: true },
    ),
    row(
      {
        id: "c-vomiting",
        at: t - 48 * H,
        by: reyes,
        corrected: "Hypokalaemia from vomiting",
        reason: "Two days of vomiting explain it.",
        original: said(
          "ESCALATE",
          "Hypokalaemia, cause unclear",
          "E87.6",
          "Low potassium after vomiting.\n- Check magnesium\n- Oral replacement if able to keep it down",
          [],
        ),
        consultation: consult(
          71,
          "female",
          ["Vomiting"],
          "Potassium 3.0 after 2 days of vomiting. Cause?",
          "routine",
          "Internal Medicine",
        ),
        status: "rejected",
        decided: { by: bello, at: t - 26 * H },
        rejection: {
          reason_code: "needs_rewording",
          note: 'Keep "cause unclear" until the magnesium result is back, and mention cardiac monitoring.',
        },
      },
      { mine: true },
    ),
    row(
      {
        id: "c-warfarin",
        at: t - 5 * H,
        by: okafor,
        corrected:
          "Warfarin over-anticoagulation from a clarithromycin interaction",
        reason:
          "Clarithromycin slows warfarin breakdown; INR 6 after starting it.",
        original: said(
          "REGENERATE",
          "Warfarin over-anticoagulation",
          null,
          "INR above range.\n- Withhold warfarin and recheck INR",
          [],
        ),
        consultation: consult(
          62,
          "male",
          ["Bleeding gums"],
          "On warfarin, started clarithromycin, INR 6. Plan?",
          "urgent",
          "Internal Medicine",
        ),
        status: "approved",
        decided: { by: reyes, at: t - 2 * H },
      },
      { reviewedByMe: true },
    ),
  ];
}

/** The demo's corrections: memory only, never stored (CONTRIBUTING). */
export function createMockCorrections({
  now,
  decideAfterMs = MOCK_DECIDE_AFTER_MS,
}: {
  now: () => number;
  decideAfterMs?: number;
}) {
  const t0 = now();
  const rows = seed(t0);
  let agreed = 42;
  let n = 0;

  const out = (r: Row): CorrectionOut => structuredClone(r.c);
  const newest = (a: Row, b: Row) =>
    Date.parse(b.c.decided_at ?? b.c.submitted_at) -
    Date.parse(a.c.decided_at ?? a.c.submitted_at);

  // Corrections sent in this session get a reviewer's decision after a while.
  function settle() {
    const t = now();
    for (const r of rows) {
      if (!r.auto || r.c.status !== "pending_review") continue;
      const at = Date.parse(r.c.submitted_at) + decideAfterMs;
      if (t < at) continue;
      r.c.decided_at = iso(at);
      if (/\bunsure\b/i.test(r.c.reason)) {
        r.c.status = "rejected";
        r.c.decided_by = MOCK_PEOPLE.bello;
        r.c.rejection = {
          reason_code: "needs_rewording",
          note: "Please add the guideline you used.",
        };
      } else {
        r.c.status = "approved";
        r.c.decided_by = MOCK_PEOPLE.okafor;
      }
    }
  }

  function find(id: string): Row {
    const r = rows.find((x) => x.c.id === id);
    if (!r) throw new ApiError(404, "not_found");
    return r;
  }
  function decidable(id: string): Row {
    const r = find(id);
    if (r.mine) throw new ApiError(403, "self_approval");
    if (r.c.status !== "pending_review")
      throw new ApiError(409, "already_decided");
    return r;
  }
  function decide(r: Row) {
    r.c.decided_by = MOCK_PEOPLE.reyes;
    r.c.decided_at = iso(now());
    r.reviewedByMe = true;
  }
  const count = (s: CorrectionStatus) =>
    rows.filter((r) => r.mine && r.c.status === s).length;

  return {
    async listPending(): Promise<CorrectionOut[]> {
      settle();
      return rows
        .filter((r) => !r.mine && r.c.status === "pending_review")
        .map(out);
    },
    async listMine(): Promise<CorrectionOut[]> {
      settle();
      return rows
        .filter((r) => r.mine)
        .sort(newest)
        .map(out);
    },
    async listReviewed(): Promise<CorrectionOut[]> {
      return rows
        .filter((r) => r.reviewedByMe)
        .sort(newest)
        .map(out);
    },
    async approve(id: string): Promise<void> {
      const r = decidable(id);
      r.c.status = "approved";
      decide(r);
    },
    async reject(id: string, x: RejectIn): Promise<void> {
      const r = decidable(id);
      r.c.status = "rejected";
      r.c.rejection = {
        reason_code: x.reason_code,
        note: x.note?.trim() || null,
      };
      decide(r);
    },
    async withdraw(id: string): Promise<void> {
      const r = find(id);
      if (!r.mine) throw new ApiError(403, "forbidden");
      if (r.c.status !== "pending_review")
        throw new ApiError(409, "already_decided");
      r.c.status = "withdrawn";
      r.c.decided_at = iso(now());
    },
    async stats(): Promise<FeedbackStatsOut> {
      settle();
      return {
        agreed,
        corrections_waiting: count("pending_review"),
        corrections_approved: count("approved"),
        corrections_rejected: count("rejected"),
        corrections_withdrawn: count("withdrawn"),
      };
    },
    recordAgreement() {
      agreed++;
    },
    /** A correction sent in this session; returns its id. */
    addMine(
      query_id: string,
      f: { corrected_diagnosis: string; reason: string },
      original: CorrectionOriginalOut,
      consultation: CorrectionConsultationOut,
    ): string {
      const id = `c-${++n}-${t0.toString(36)}`;
      rows.push({
        c: {
          id,
          query_id,
          status: "pending_review",
          corrected_diagnosis: f.corrected_diagnosis,
          reason: f.reason,
          submitted_by: MOCK_PEOPLE.reyes,
          submitted_at: iso(now()),
          original,
          consultation,
          decided_by: null,
          decided_at: null,
          rejection: null,
        },
        mine: true,
        reviewedByMe: false,
        auto: true,
      });
      return id;
    },
  };
}

export type MockCorrections = ReturnType<typeof createMockCorrections>;
```

- [ ] **Step 6: Wire them into the mock client**

Replace `lib/api/mock.ts` with (the scenario logic is unchanged; jobs now
keep the question so a correction knows what was asked):

```ts
import type { MhaiClient } from "./client";
import type {
  CorrectionConsultationOut,
  CorrectionOriginalOut,
  QueryCreateIn,
  Stage,
} from "./contract";
import { FIXTURES } from "./fixtures";
import { createMockCorrections } from "./mock-corrections";

type Scenario = keyof typeof FIXTURES | "failed";
const ORDER: Stage[] = [
  "pii_masking",
  "retrieval",
  "generation",
  "nli_verification",
  "hga_verification",
  "decision",
];

// Whole words only, so everyday clinical wording ("heart failure", "review
// his medications") gets the normal demo result.
const has = (t: string, ...words: string[]) =>
  words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(t));

export function pickScenario(q: QueryCreateIn): Scenario {
  const t = q.clinical_question;
  if (has(t, "fail")) return "failed";
  if (has(t, "potassium")) return "review";
  if (has(t, "fever", "dengue")) return "caution";
  return "high";
}

const NO_ORIGINAL: CorrectionOriginalOut = {
  decision: "PASS",
  degraded: false,
  diagnosis: null,
  icd10_code: null,
  response_text: "",
  citations: [],
};
const NO_CONSULTATION: CorrectionConsultationOut = {
  age: 0,
  sex: "unknown",
  symptoms: [],
  clinical_question: "",
  urgency: "routine",
  specialty: null,
};

function originalFor(s: Scenario | undefined): CorrectionOriginalOut {
  if (!s || s === "failed") return NO_ORIGINAL;
  const r = FIXTURES[s];
  return {
    decision: r.decision,
    degraded: r.degraded,
    diagnosis: r.diagnosis,
    icd10_code: r.icd10_code,
    response_text: r.response_text,
    citations: r.citations.map(({ source_title, claim_text, action }) => ({
      source_title,
      claim_text,
      action,
    })),
  };
}

const consultationFor = (
  q: QueryCreateIn | undefined,
): CorrectionConsultationOut =>
  q
    ? {
        age: q.patient_data.age,
        sex: q.patient_data.sex,
        symptoms: [...q.patient_data.symptoms],
        clinical_question: q.clinical_question,
        urgency: q.urgency,
        specialty: q.specialty ?? null,
      }
    : NO_CONSULTATION;

export function createMockClient({
  stepMs = 1500,
  now = () => Date.now(),
  decideAfterMs,
}: {
  stepMs?: number;
  now?: () => number;
  decideAfterMs?: number;
} = {}): MhaiClient {
  // In memory only: never persisted (CONTRIBUTING: no PHI in browser storage).
  const jobs = new Map<
    string,
    { started: number; scenario: Scenario; q: QueryCreateIn }
  >();
  const corrections = createMockCorrections({ now, decideAfterMs });
  let n = 0;
  return {
    async createQuery(q) {
      const id = `mock-${++n}-${Math.random().toString(36).slice(2, 8)}`;
      jobs.set(id, { started: now(), scenario: pickScenario(q), q });
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
      if (f.action === "validate") {
        corrections.recordAgreement();
        return { status: "recorded" };
      }
      const job = jobs.get(f.query_id);
      return {
        status: "pending_review",
        correction_id: corrections.addMine(
          f.query_id,
          f,
          originalFor(job?.scenario),
          consultationFor(job?.q),
        ),
      };
    },
    async getReadiness() {
      return { ok: true, degraded_services: [] };
    },
    listPendingCorrections: () => corrections.listPending(),
    listMyCorrections: () => corrections.listMine(),
    listMyReviews: () => corrections.listReviewed(),
    approveCorrection: (id) => corrections.approve(id),
    rejectCorrection: (id, r) => corrections.reject(id, r),
    withdrawCorrection: (id) => corrections.withdraw(id),
    getMyFeedbackStats: () => corrections.stats(),
  };
}
```

- [ ] **Step 7: Add the live calls**

Replace `lib/api/live.ts` with:

```ts
import { reportUnauthorized } from "../auth/events";
import type { MhaiClient } from "./client";
import type {
  ClinicalResultOut,
  CorrectionOut,
  FeedbackStatsOut,
  QueryStatusOut,
  Readiness,
  WriteOpts,
} from "./contract";
import { ApiError } from "./errors";

/** The real API, through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): MhaiClient {
  async function call(
    path: string,
    method = "GET",
    body?: unknown,
    extra?: Record<string, string>,
    keepalive = false,
  ) {
    let res: Response;
    try {
      res = await fetchImpl(`/api/v1${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        // An approval sent while the page unloads must outlive the page.
        ...(keepalive ? { keepalive: true } : {}),
      });
    } catch {
      throw new ApiError(0, "network");
    }
    if (res.status === 401) {
      reportUnauthorized();
      throw new ApiError(401, "session_expired");
    }
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { res, data };
  }
  async function ok<T>(
    path: string,
    method = "GET",
    body?: unknown,
    extra?: Record<string, string>,
    keepalive = false,
  ): Promise<T> {
    const { res, data } = await call(path, method, body, extra, keepalive);
    if (!res.ok)
      throw new ApiError(
        res.status,
        typeof data?.code === "string" ? data.code : "error",
      );
    return data as T;
  }
  const id = encodeURIComponent;
  const keyHeader = (opts?: { idempotencyKey?: string }) =>
    opts?.idempotencyKey
      ? { "Idempotency-Key": opts.idempotencyKey }
      : undefined;
  const decide = async (path: string, body: unknown, opts?: WriteOpts) => {
    await ok<unknown>(
      path,
      "POST",
      body,
      keyHeader(opts),
      opts?.keepalive === true,
    );
  };
  return {
    async createQuery(q, opts) {
      const r = await ok<{ query_id: string }>(
        "/queries",
        "POST",
        q,
        keyHeader(opts),
      );
      return { query_id: r.query_id };
    },
    getStatus: (q) => ok<QueryStatusOut>(`/queries/${id(q)}`),
    getResult: (q) => ok<ClinicalResultOut>(`/queries/${id(q)}/result`),
    sendFeedback: (f, opts) => ok("/feedback", "POST", f, keyHeader(opts)),
    async getReadiness(): Promise<Readiness> {
      const { res, data } = await call("/readyz");
      if (res.ok) return { ok: true, degraded_services: [] };
      if (res.status === 503 && data)
        return {
          ok: false,
          degraded_services: Object.entries(data)
            .filter(([, up]) => up === false)
            .map(([name]) => name),
        };
      throw new ApiError(res.status, "error");
    },
    listPendingCorrections: () =>
      ok<CorrectionOut[]>("/corrections?status=pending"),
    listMyCorrections: () => ok<CorrectionOut[]>("/corrections/mine"),
    listMyReviews: () => ok<CorrectionOut[]>("/corrections/reviewed"),
    approveCorrection: (c, opts) =>
      decide(`/corrections/${id(c)}/approve`, undefined, opts),
    rejectCorrection: (c, r, opts) =>
      decide(`/corrections/${id(c)}/reject`, r, opts),
    withdrawCorrection: (c, opts) =>
      decide(`/corrections/${id(c)}/withdraw`, undefined, opts),
    getMyFeedbackStats: () => ok<FeedbackStatsOut>("/feedback/stats/mine"),
  };
}
```

- [ ] **Step 8: Never show the correction codes**

In `lib/labels.ts`, extend `FORBIDDEN_TERMS` so the plain-language test and
the e2e word check cover the new codes:

```ts
export const FORBIDDEN_TERMS = [
  "trust score",
  "NLI",
  "entropy",
  "PASS",
  "REGENERATE",
  "ESCALATE",
  "guardrail",
  "KB",
  "pending_review",
  "self_approval",
] as const;
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx vitest run lib/api lib/labels.test.ts`
Expected: PASS, including the existing `mock.test.ts` and `live.test.ts`.

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 10: Commit**

```bash
git add lib/api lib/labels.ts
git commit -m "Add the corrections API: types, mock data and live calls"
```

---

### Task 2: The BFF route shapes and the backend asks

**Files:**

- Modify: `app/api/v1/[...path]/route.ts`, `app/api/v1/proxy.test.ts`,
  `docs/specs/2026-10-13-ui-design-v3.md` (§10 item 1, §11),
  `ARCHITECTURE.md` (§4.6)
- Test: `app/api/v1/proxy.test.ts`

**Interfaces:**

- Consumes: the proxy's existing helpers (`apiBase`, `json`, `forbidden`,
  `sameOrigin`, `readSession`, `refreshOnce`) and its test helpers (`ctx`,
  `get`, `post`, `session`, `fetchMock`).
- Produces: `shapeAllowed(method: string, path: string[]): boolean` (module
  private). The proxy forwards only these correction and feedback shapes:
  - `GET corrections`, `GET corrections/mine`, `GET corrections/reviewed`;
  - `POST corrections/{id}/approve|reject|withdraw`;
  - `POST feedback`, `GET feedback/stats/mine`.

  Everything else under `corrections` or `feedback` gets 404 without calling
  the API. `queries` and `readyz` keep today's rules. The per-segment
  `/^[A-Za-z0-9_-]+$/` check and the clinician-only rule are unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `app/api/v1/proxy.test.ts`, after the last `describe` (it reuses
that file's `ctx`, `get`, `post`, `session` and `fetchMock`):

```ts
describe("corrections and feedback routes", () => {
  it.each([
    ["GET", ["corrections"]],
    ["GET", ["corrections", "mine"]],
    ["GET", ["corrections", "reviewed"]],
    ["GET", ["feedback", "stats", "mine"]],
    ["POST", ["corrections", "c-1", "approve"]],
    ["POST", ["corrections", "c-1", "reject"]],
    ["POST", ["corrections", "c-1", "withdraw"]],
    ["POST", ["feedback"]],
  ])("forwards %s %j", async (method, path) => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json({}));
    const res =
      method === "GET"
        ? await GET(get(), ctx(...path))
        : await POST(post("{}"), ctx(...path));
    expect(res.status).toBe(200);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      `http://api.test/api/v1/${path.join("/")}`,
    );
  });

  it.each([
    ["GET", ["corrections", "c-1"]],
    ["GET", ["corrections", "c-1", "approve"]],
    ["POST", ["corrections"]],
    ["POST", ["corrections", "c-1"]],
    ["POST", ["corrections", "c-1", "delete"]],
    ["POST", ["corrections", "c-1", "approve", "x"]],
    ["GET", ["feedback"]],
    ["GET", ["feedback", "stats", "all"]],
    ["POST", ["feedback", "stats", "mine"]],
    ["POST", ["corrections", "c.1", "approve"]],
  ])("refuses %s %j without calling the API", async (method, path) => {
    await session();
    const res =
      method === "GET"
        ? await GET(get(), ctx(...path))
        : await POST(post("{}"), ctx(...path));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes the waiting filter through", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await GET(
      get("http://demo.test/api/v1/corrections?status=pending"),
      ctx("corrections"),
    );
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      "http://api.test/api/v1/corrections?status=pending",
    );
  });

  it("forwards a decision's idempotency key and keeps only the refusal code", async () => {
    await session();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: "self_approval", detail: "user 42 submitted it" },
        { status: 403 },
      ),
    );
    const res = await POST(
      post("{}", "http://demo.test", { "Idempotency-Key": "k-9" }),
      ctx("corrections", "c-1", "approve"),
    );
    expect(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers,
    ).toMatchObject({ "Idempotency-Key": "k-9" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ code: "self_approval" });
  });

  it("refuses a decision from another site", async () => {
    await session();
    const res = await POST(
      post("{}", "https://evil.test"),
      ctx("corrections", "c-1", "approve"),
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run app/api/v1/proxy.test.ts`
Expected: FAIL. The "refuses … without calling the API" cases get 200 or
an upstream call instead of 404 (for example `GET ["corrections","c-1"]`).

- [ ] **Step 3: Allow only the shapes the client uses**

In `app/api/v1/[...path]/route.ts`, below `const IDEMPOTENCY_KEY = …`, add:

```ts
const DECISIONS = new Set(["approve", "reject", "withdraw"]);
const MY_LISTS = new Set(["mine", "reviewed"]);

/** Corrections and feedback only take the shapes the client uses (Plan 3). */
function shapeAllowed(method: string, path: string[]): boolean {
  const [first, second, third] = path;
  if (first === "corrections") {
    if (method === "GET")
      return (
        path.length === 1 || (path.length === 2 && MY_LISTS.has(second ?? ""))
      );
    return path.length === 3 && DECISIONS.has(third ?? "");
  }
  if (first === "feedback") {
    if (method === "GET")
      return path.length === 3 && second === "stats" && third === "mine";
    return path.length === 1;
  }
  return true;
}
```

and change the first check in `handle` to:

```ts
if (
  !ALLOWED.has(path[0] ?? "") ||
  !path.every((p) => SEGMENT.test(p)) ||
  !shapeAllowed(req.method, path)
)
  return json(404, { code: "not_found" });
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run app/api/v1/proxy.test.ts`
Expected: PASS (the existing proxy tests too).

- [ ] **Step 5: Tell the backend (spec §10 item 1, §11, ARCHITECTURE)**

In `docs/specs/2026-10-13-ui-design-v3.md` §10, replace item 1 with:

```markdown
1. **Corrections:** reject with a reason, withdraw, and "my corrections"
   (your own, with status and the reviewer's reason). Notifications for
   decisions: polling is enough at first. **Assumed contract** (Plan 3).
   The frontend calls these until the backend defines them, so please
   match them or tell us what changed:
   - every correction the API returns has `id`, `query_id`, `status`
     (`pending_review`, `approved`, `rejected` or `withdrawn`),
     `corrected_diagnosis`, `reason`, `submitted_by` and `decided_by`
     (`{display_name, full_name, specialty, hospital}`, never an id),
     `submitted_at`, `decided_at` and `rejection` (`{reason_code, note}`);
   - for the review compare view it also has `original` (`decision`,
     `degraded`, `diagnosis`, `icd10_code`, `response_text`,
     `citations[{source_title, claim_text, action}]`) and `consultation`
     (`age`, `sex`, `symptoms`, `clinical_question`, `urgency`,
     `specialty`). The reviewer isn't the query owner, so
     `GET /queries/{id}/result` can't serve this;
   - `GET /corrections?status=pending` returns that shape (others' only, as
     today);
   - `GET /corrections/mine`: your own, every status, newest first;
   - `GET /corrections/reviewed`: your recent decisions as a reviewer
     (last 30 days, at most 50);
   - `POST /corrections/{id}/approve` → 204;
   - `POST /corrections/{id}/reject {reason_code, note?}` → 204, with
     `reason_code` one of `not_supported`, `needs_rewording`, `unsafe` or
     `out_of_scope`, and `note` up to 500 characters; **403**
     `self_approval` on your own, as for approve;
   - `POST /corrections/{id}/withdraw` → 204, your own waiting correction
     only (**403** `forbidden` otherwise);
   - **409** `already_decided` when approve, reject or withdraw meets a
     correction that is no longer waiting, and **404** `not_found` for an
     unknown id;
   - honour `Idempotency-Key` on approve, reject and withdraw, kept as long
     as for `POST /feedback` (items 15 and 19);
   - `GET /feedback/stats/mine` returns `agreed`, `corrections_waiting`,
     `corrections_approved`, `corrections_rejected` and
     `corrections_withdrawn`;
   - an approval can arrive as a browser `keepalive` request: the
     10-second undo ends early when the reviewer leaves the page, and the
     approval is sent then. Treat it like any other request.
```

In §11, replace the bullet about the correction review turnaround with:

```markdown
- The correction review turnaround (the 4-hour "overdue" mark is a
  placeholder, `REVIEW_OVERDUE_MS`) and whether reviewers are limited to
  their own specialty. Until decided (Plan 3), every clinician sees the
  whole queue, "My specialty" is a filter rather than a restriction, and
  the sidebar entry hides if the API refuses the queue (403).
```

In `ARCHITECTURE.md` §4.6, replace the paragraph under the sequence diagram
("Rejecting with a reason, withdrawing, and the "My corrections" list need
new endpoints. They're listed in the design spec §10.") with:

```markdown
Rejecting with a reason, withdrawing, "My corrections", your recent
decisions and the feedback stats use an assumed contract until the backend
defines them (design spec §10 item 1). After Approve, the reviewer has 10
seconds to undo; the approval is sent when that window ends or when they
leave the page, whichever comes first.
```

- [ ] **Step 6: Check and commit**

Run: `npx prettier --check docs/specs/2026-10-13-ui-design-v3.md ARCHITECTURE.md && npm run lint`
Expected: clean (run `npx prettier --write` on the two files first if the
check reports them).

```bash
git add app/api/v1 docs/specs/2026-10-13-ui-design-v3.md ARCHITECTURE.md
git commit -m "Forward only the correction routes the app uses; list the asks"
```

---

### Task 3: Correction rules and the word diff

**Files:**

- Create: `lib/corrections.ts`, `lib/corrections.test.ts`,
  `lib/word-diff.ts`, `lib/word-diff.test.ts`, `tests/corrections.ts`
- Test: `lib/corrections.test.ts`, `lib/word-diff.test.ts`

**Interfaces:**

- Consumes: `CorrectionOut`, `CorrectionOriginalOut`, `CorrectionStatus`,
  `RejectReasonCode` (Task 1); `ApiError`; `ResultKind` (`lib/labels.ts`).
- Produces (`lib/corrections.ts`):
  - constants `REVIEW_OVERDUE_MS` (4 h), `OVERDUE_LABEL` ("Over 4 h"),
    `UNDO_WINDOW_MS` (10 000), `NOTE_MAX` (500);
  - `REJECT_REASONS: readonly { code: RejectReasonCode; label: string }[]`;
  - `STATUS_VIEW: Record<CorrectionStatus, { label: string; tone: "warn" | "ok" | "bad" | "brand" }>`;
  - `originalKind(o: Pick<CorrectionOriginalOut, "decision" | "degraded">): ResultKind`;
  - `correctionTitle(c: Pick<CorrectionOut, "original">): string`;
  - `parseTime(iso: string | null | undefined): number | null`;
  - `ageLabel(fromMs: number, now: number): string`;
  - `isOverdue(c: Pick<CorrectionOut, "status" | "submitted_at">, now: number): boolean`;
  - `rejectionText(r: CorrectionOut["rejection"]): string | null`;
  - `statusLine(c: CorrectionOut, now: number): string`;
  - `interface QueueItem { c: CorrectionOut; mine: boolean }`;
  - `buildQueue(others: CorrectionOut[], mine: CorrectionOut[]): QueueItem[]`;
  - `pickNext(queue: QueueItem[], index: number): QueueItem | null`;
  - `type DecisionAction = "approve" | "reject" | "withdraw"`,
    `interface DecisionError { title: string; body: string; gone: boolean; own: boolean }`,
    `decisionError(e: unknown, action: DecisionAction): DecisionError`.
- Produces (`lib/word-diff.ts`): `type DiffPart = { kind: "same" | "add" | "del"; text: string }`,
  `DIFF_TOKEN_LIMIT` (400), `tokenize(s: string): string[]`,
  `wordDiff(before: string, after: string): DiffPart[]`.
- Produces (`tests/corrections.ts`): `T0` (2026-10-16 12:00 UTC) and
  `makeCorrection(over?: Partial<CorrectionOut>): CorrectionOut`, a waiting
  dengue correction from Dr. Okafor submitted 42 minutes before `T0`.

- [ ] **Step 1: Write the test builder**

`tests/corrections.ts`:

```ts
import type { CorrectionOut } from "@/lib/api/contract";

/** "Now" for correction tests: 2026-10-16 12:00 UTC. */
export const T0 = Date.parse("2026-10-16T12:00:00.000Z");

/** A waiting correction from Dr. Okafor, 42 minutes before T0 (synthetic). */
export function makeCorrection(
  over: Partial<CorrectionOut> = {},
): CorrectionOut {
  return {
    id: "c1",
    query_id: "q1",
    status: "pending_review",
    corrected_diagnosis: "Dengue fever with warning signs: admit",
    reason: "Persistent vomiting is a warning sign.",
    submitted_by: {
      display_name: "Dr. Okafor",
      full_name: "Dr. Chidi Okafor",
      specialty: "Paediatrics",
      hospital: "Havana Hospital",
    },
    submitted_at: new Date(T0 - 42 * 60_000).toISOString(),
    original: {
      decision: "REGENERATE",
      degraded: false,
      diagnosis: "Dengue fever, likely",
      icd10_code: "A90",
      response_text:
        "Febrile illness with rash.\n- Admit if platelets fall below 100 × 10⁹/L",
      citations: [
        {
          source_title: "WHO Dengue Guidelines 2024",
          claim_text: "NS1 antigen test and full blood count",
          action: "PASS",
        },
        {
          source_title: "WHO Dengue Guidelines 2024",
          claim_text: "Admit if platelets fall below 100 × 10⁹/L",
          action: "FLAG",
        },
      ],
    },
    consultation: {
      age: 24,
      sex: "female",
      symptoms: ["Fever", "Rash"],
      clinical_question: "Fever 3 days and rash, dengue area. Admit?",
      urgency: "urgent",
      specialty: "Infectious disease",
    },
    decided_by: null,
    decided_at: null,
    rejection: null,
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`lib/corrections.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { T0, makeCorrection } from "@/tests/corrections";
import { ApiError } from "./api/errors";
import {
  OVERDUE_LABEL,
  REJECT_REASONS,
  REVIEW_OVERDUE_MS,
  STATUS_VIEW,
  ageLabel,
  buildQueue,
  correctionTitle,
  decisionError,
  isOverdue,
  originalKind,
  parseTime,
  pickNext,
  rejectionText,
  statusLine,
} from "./corrections";
import { FORBIDDEN_TERMS } from "./labels";

const at = (msAgo: number) => new Date(T0 - msAgo).toISOString();
const H = 3_600_000;

describe("correction rules", () => {
  it("flags a waiting correction from exactly 4 hours", () => {
    expect(REVIEW_OVERDUE_MS).toBe(4 * H);
    expect(OVERDUE_LABEL).toBe("Over 4 h");
    expect(
      isOverdue(makeCorrection({ submitted_at: at(REVIEW_OVERDUE_MS) }), T0),
    ).toBe(true);
    expect(
      isOverdue(
        makeCorrection({ submitted_at: at(REVIEW_OVERDUE_MS - 1) }),
        T0,
      ),
    ).toBe(false);
    expect(
      isOverdue(
        makeCorrection({ submitted_at: at(9 * H), status: "approved" }),
        T0,
      ),
    ).toBe(false);
    expect(isOverdue(makeCorrection({ submitted_at: "not a date" }), T0)).toBe(
      false,
    );
  });

  it("writes ages in minutes, hours and days, never negative", () => {
    expect(ageLabel(T0 - 42 * 60_000, T0)).toBe("42 min");
    expect(ageLabel(T0 - 3 * H - 59 * 60_000, T0)).toBe("3 h");
    expect(ageLabel(T0 - 50 * H, T0)).toBe("2 d");
    expect(ageLabel(T0 + 60_000, T0)).toBe("0 min");
    expect(parseTime(null)).toBeNull();
    expect(parseTime("garbage")).toBeNull();
    expect(parseTime("2026-10-16T12:00:00Z")).toBe(T0);
  });

  it("maps what the system said to the result labels, degraded first", () => {
    expect(originalKind({ decision: "PASS", degraded: false })).toBe("high");
    expect(originalKind({ decision: "REGENERATE", degraded: false })).toBe(
      "caution",
    );
    expect(originalKind({ decision: "ESCALATE", degraded: false })).toBe(
      "review",
    );
    expect(originalKind({ decision: "PASS", degraded: true })).toBe("review");
  });

  it("titles a correction by the system's diagnosis", () => {
    expect(correctionTitle(makeCorrection())).toBe("Dengue fever, likely");
    const blank = makeCorrection();
    blank.original.diagnosis = "  ";
    expect(correctionTitle(blank)).toBe("Consultation");
  });

  it("puts the reviewer's reason in words", () => {
    expect(
      rejectionText({
        reason_code: "needs_rewording",
        note: "Mention monitoring.",
      }),
    ).toBe("Partly right, needs rewording: Mention monitoring.");
    expect(rejectionText({ reason_code: "unsafe", note: null })).toBe("Unsafe");
    expect(rejectionText(null)).toBeNull();
  });

  it("builds the queue oldest first, with your own waiting ones marked", () => {
    const a = makeCorrection({ id: "a", submitted_at: at(60_000) });
    const b = makeCorrection({ id: "b", submitted_at: at(5 * H) });
    const mine = makeCorrection({ id: "m", submitted_at: at(H) });
    const done = makeCorrection({ id: "d", status: "approved" });
    expect(
      buildQueue([a, b], [mine, done]).map((i) => [i.c.id, i.mine]),
    ).toEqual([
      ["b", false],
      ["m", true],
      ["a", false],
    ]);
  });

  it("never lists one correction twice, and trusts your own list", () => {
    const x = makeCorrection({ id: "x" });
    expect(buildQueue([x], [x]).map((i) => [i.c.id, i.mine])).toEqual([
      ["x", true],
    ]);
  });

  it("picks the next one you can decide, then your own, then nothing", () => {
    const o1 = { c: makeCorrection({ id: "o1" }), mine: false };
    const m1 = { c: makeCorrection({ id: "m1" }), mine: true };
    const o2 = { c: makeCorrection({ id: "o2" }), mine: false };
    expect(pickNext([o1, m1, o2], 1)?.c.id).toBe("o2");
    expect(pickNext([o1, m1, o2], 0)?.c.id).toBe("o1");
    expect(pickNext([m1, o1], 2)?.c.id).toBe("o1");
    expect(pickNext([m1], 0)?.c.id).toBe("m1");
    expect(pickNext([], 0)).toBeNull();
  });

  it("explains a refused decision in plain words (Review Focus 4)", () => {
    expect(
      decisionError(new ApiError(403, "self_approval"), "approve"),
    ).toMatchObject({
      title: "This is your own correction",
      own: true,
      gone: false,
    });
    expect(
      decisionError(new ApiError(409, "already_decided"), "reject"),
    ).toMatchObject({
      title: "Another clinician decided this one first",
      gone: true,
    });
    expect(
      decisionError(new ApiError(404, "not_found"), "withdraw"),
    ).toMatchObject({
      title: "This correction was already decided",
      gone: true,
    });
    const offline = decisionError(new ApiError(0, "network"), "approve");
    expect(offline).toMatchObject({
      title: "Your approval wasn't sent",
      gone: false,
      own: false,
    });
    expect(offline.body).toMatch(/offline/);
    expect(decisionError(new Error("boom"), "reject")).toMatchObject({
      title: "Your rejection wasn't sent",
      gone: false,
      own: false,
    });
  });

  it("describes where each of your corrections stands", () => {
    expect(statusLine(makeCorrection(), T0)).toBe("Submitted 42 min ago");
    expect(
      statusLine(
        makeCorrection({
          status: "approved",
          decided_by: {
            display_name: "Dr. Bello",
            full_name: null,
            specialty: null,
            hospital: null,
          },
          decided_at: at(2 * H),
        }),
        T0,
      ),
    ).toBe("Approved by Dr. Bello · 2 h ago · goes to clinical sign-off next");
    expect(statusLine(makeCorrection({ status: "rejected" }), T0)).toBe(
      "Rejected",
    );
    expect(
      statusLine(
        makeCorrection({ status: "withdrawn", decided_at: at(60_000) }),
        T0,
      ),
    ).toBe("You withdrew it · 1 min ago");
  });

  it("uses plain language only", () => {
    const errors = [
      new ApiError(403, "self_approval"),
      new ApiError(409, "already_decided"),
      new ApiError(0, "network"),
      new ApiError(401, "session_expired"),
      new ApiError(500, "error"),
    ];
    const shown = [
      OVERDUE_LABEL,
      ...REJECT_REASONS.map((r) => r.label),
      ...Object.values(STATUS_VIEW).map((s) => s.label),
      ...(["approve", "reject", "withdraw"] as const).flatMap((a) =>
        errors.flatMap((e) => {
          const d = decisionError(e, a);
          return [d.title, d.body];
        }),
      ),
    ].join(" ");
    const upper = FORBIDDEN_TERMS.filter((t) => t === t.toUpperCase());
    const lower = FORBIDDEN_TERMS.filter((t) => t !== t.toUpperCase());
    expect(shown).not.toMatch(new RegExp(`\\b(${upper.join("|")})\\b`));
    expect(shown).not.toMatch(new RegExp(`\\b(${lower.join("|")})\\b`, "i"));
  });
});
```

`lib/word-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  DIFF_TOKEN_LIMIT,
  tokenize,
  wordDiff,
  type DiffPart,
} from "./word-diff";

const before = (p: DiffPart[]) =>
  p
    .filter((x) => x.kind !== "add")
    .map((x) => x.text)
    .join("");
const after = (p: DiffPart[]) =>
  p
    .filter((x) => x.kind !== "del")
    .map((x) => x.text)
    .join("");
const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

describe("wordDiff", () => {
  it("marks a changed word and keeps the rest", () => {
    expect(wordDiff("Acute asthma, moderate", "Acute asthma, severe")).toEqual([
      { kind: "same", text: "Acute asthma, " },
      { kind: "del", text: "moderate" },
      { kind: "add", text: "severe" },
    ]);
  });

  it("handles additions, identical text and empty sides", () => {
    expect(
      wordDiff("Hypokalaemia", "Hypokalaemia, likely from diuretic use"),
    ).toEqual([
      { kind: "same", text: "Hypokalaemia" },
      { kind: "add", text: ", likely from diuretic use" },
    ]);
    expect(wordDiff("NSTEMI", "NSTEMI")).toEqual([
      { kind: "same", text: "NSTEMI" },
    ]);
    expect(wordDiff("", "New text")).toEqual([
      { kind: "add", text: "New text" },
    ]);
    expect(wordDiff("", "")).toEqual([]);
  });

  it("treats Unicode letters, marks and numbers as words", () => {
    expect(tokenize("Café 10⁹/L")).toEqual(["Café", " ", "10⁹", "/", "L"]);
  });

  it("keeps every character, including emoji and combining marks (Review Focus 5)", () => {
    const samples: [string, string][] = [
      ["Fiebre 🙂 alta", "Fiebre 🙂 muy alta"],
      ["Café au lait spots", "Café au lait macules"],
      ["Platelets < 100 × 10⁹/L", "Platelets < 20 × 10⁹/L"],
      ["حمى الضنك", "حمى الضنك الشديدة"],
      ["👩🏽‍⚕️ advice", "👩🏽‍⚕️ urgent advice"],
    ];
    for (const [a, b] of samples) {
      const d = wordDiff(a, b);
      expect(before(d)).toBe(a);
      expect(after(d)).toBe(b);
      for (const part of d) expect(part.text).not.toMatch(LONE_SURROGATE);
    }
  });

  it("falls back to before and after for very long text, quickly", () => {
    const words = Array.from({ length: DIFF_TOKEN_LIMIT }, (_, i) => `w${i}`);
    const a = `${words.join(" ")} ${words.join(" ")}`;
    const b = `${"x".repeat(2000)} ${words.join(" ")}`;
    const started = performance.now();
    const d = wordDiff(a, b);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(before(d)).toBe(a);
    expect(after(d)).toBe(b);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run lib/corrections.test.ts lib/word-diff.test.ts`
Expected: FAIL: `./corrections` and `./word-diff` can't be resolved.

- [ ] **Step 4: Write the rules**

`lib/corrections.ts`:

```ts
import type {
  CorrectionOriginalOut,
  CorrectionOut,
  CorrectionStatus,
  RejectReasonCode,
} from "./api/contract";
import { ApiError } from "./api/errors";
import type { ResultKind } from "./labels";

/** Placeholder turnaround (spec §11): waiting this long gets flagged. */
export const REVIEW_OVERDUE_MS = 4 * 60 * 60_000;
export const OVERDUE_LABEL = `Over ${REVIEW_OVERDUE_MS / 3_600_000} h`;
/** After Approve, this long to undo before the approval is sent (ruling R1). */
export const UNDO_WINDOW_MS = 10_000;
/** The longest reviewer note the API takes (spec §10 item 1). */
export const NOTE_MAX = 500;

export const REJECT_REASONS: readonly {
  code: RejectReasonCode;
  label: string;
}[] = [
  { code: "not_supported", label: "Not supported by guidelines" },
  { code: "needs_rewording", label: "Partly right, needs rewording" },
  { code: "unsafe", label: "Unsafe" },
  { code: "out_of_scope", label: "Out of scope" },
];

export const STATUS_VIEW: Record<
  CorrectionStatus,
  { label: string; tone: "warn" | "ok" | "bad" | "brand" }
> = {
  pending_review: { label: "Waiting", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "bad" },
  withdrawn: { label: "Withdrawn", tone: "brand" },
};

/** The same safety rule as the result screen: degraded or escalated needs review. */
export function originalKind(
  o: Pick<CorrectionOriginalOut, "decision" | "degraded">,
): ResultKind {
  if (o.degraded || o.decision === "ESCALATE") return "review";
  return o.decision === "REGENERATE" ? "caution" : "high";
}

export const correctionTitle = (c: Pick<CorrectionOut, "original">) =>
  c.original.diagnosis?.trim() || "Consultation";

export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** "42 min", "3 h", "2 d". A clock running ahead shows "0 min", never negative. */
export function ageLabel(fromMs: number, now: number): string {
  const m = Math.max(0, Math.floor((now - fromMs) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

export function isOverdue(
  c: Pick<CorrectionOut, "status" | "submitted_at">,
  now: number,
): boolean {
  const t = parseTime(c.submitted_at);
  return (
    c.status === "pending_review" && t !== null && now - t >= REVIEW_OVERDUE_MS
  );
}

/** The reviewer's reason as the suggester reads it. */
export function rejectionText(r: CorrectionOut["rejection"]): string | null {
  if (!r) return null;
  const label =
    REJECT_REASONS.find((x) => x.code === r.reason_code)?.label ??
    "Another reason";
  return r.note ? `${label}: ${r.note}` : label;
}

/** One line under a correction in My feedback & corrections. */
export function statusLine(c: CorrectionOut, now: number): string {
  const when = (iso: string | null) => {
    const t = parseTime(iso);
    return t === null ? null : `${ageLabel(t, now)} ago`;
  };
  const join = (...p: (string | null)[]) => p.filter(Boolean).join(" · ");
  const by = c.decided_by?.display_name;
  switch (c.status) {
    case "pending_review": {
      const w = when(c.submitted_at);
      return w ? `Submitted ${w}` : "Submitted";
    }
    case "approved":
      return join(
        by ? `Approved by ${by}` : "Approved",
        when(c.decided_at),
        "goes to clinical sign-off next",
      );
    case "rejected":
      return join(by ? `Rejected by ${by}` : "Rejected", when(c.decided_at));
    case "withdrawn":
      return join("You withdrew it", when(c.decided_at));
  }
}

export interface QueueItem {
  c: CorrectionOut;
  /** Your own: you can withdraw it but not decide it. */
  mine: boolean;
}

/** Others' waiting corrections plus your own waiting ones, oldest first (R4, R5). */
export function buildQueue(
  others: CorrectionOut[],
  mine: CorrectionOut[],
): QueueItem[] {
  const own = new Set(mine.map((c) => c.id));
  return [
    ...others.filter((c) => !own.has(c.id)).map((c) => ({ c, mine: false })),
    ...mine.map((c) => ({ c, mine: true })),
  ]
    .filter((i) => i.c.status === "pending_review")
    .sort(
      (a, b) =>
        (parseTime(a.c.submitted_at) ?? 0) - (parseTime(b.c.submitted_at) ?? 0),
    );
}

/**
 * What to show once the item at `index` has left `queue`: the next one you
 * can decide (wrapping round), else your own, else nothing.
 */
export function pickNext(queue: QueueItem[], index: number): QueueItem | null {
  const rotated = [...queue.slice(index), ...queue.slice(0, index)];
  return rotated.find((i) => !i.mine) ?? rotated[0] ?? null;
}

export type DecisionAction = "approve" | "reject" | "withdraw";
export interface DecisionError {
  title: string;
  body: string;
  /** No longer waiting: someone else decided it, or it's gone. */
  gone: boolean;
  /** The API says it's your own correction. */
  own: boolean;
}

const NOT_SENT: Record<DecisionAction, string> = {
  approve: "Your approval wasn't sent",
  reject: "Your rejection wasn't sent",
  withdraw: "Your correction wasn't withdrawn",
};

/** Plain words for a refused or failed decision. Never shows the API's code. */
export function decisionError(
  e: unknown,
  action: DecisionAction,
): DecisionError {
  const fail = (body: string): DecisionError => ({
    title: NOT_SENT[action],
    body,
    gone: false,
    own: false,
  });
  if (!(e instanceof ApiError))
    return fail("Something went wrong. Nothing was changed; try again.");
  if (e.code === "self_approval")
    return {
      title: "This is your own correction",
      body: "Another clinician needs to review it. You can withdraw it instead.",
      gone: false,
      own: true,
    };
  if (e.status === 409 || e.status === 404)
    return {
      title:
        action === "withdraw"
          ? "This correction was already decided"
          : "Another clinician decided this one first",
      body: "Nothing was changed by you. It has left the queue.",
      gone: true,
      own: false,
    };
  if (e.status === 0)
    return fail(
      "You're offline or the connection dropped. Nothing was changed; try again when you're back online.",
    );
  if (e.status === 401)
    return fail("Your session ended. Sign in again to carry on.");
  return fail(
    "Something went wrong on our side. Nothing was changed; try again.",
  );
}
```

- [ ] **Step 5: Write the diff**

`lib/word-diff.ts`:

```ts
export type DiffPart = { kind: "same" | "add" | "del"; text: string };

/** Above this many tokens on both sides (multiplied), show plain before/after. */
export const DIFF_TOKEN_LIMIT = 400;

// Words are runs of letters, combining marks and numbers in any script;
// each run of spaces, and every other character (punctuation, symbols,
// emoji parts), is its own token. Together they cover every code point, so
// joining the tokens always gives back the text.
const TOKEN = /[\p{L}\p{M}\p{N}]+|\s+|[^\p{L}\p{M}\p{N}\s]/gu;

export const tokenize = (s: string): string[] => s.match(TOKEN) ?? [];

function merge(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const p of parts) {
    if (!p.text) continue;
    const last = out[out.length - 1];
    if (last && last.kind === p.kind) last.text += p.text;
    else out.push({ ...p });
  }
  return out;
}

/** Word-level changes from `before` to `after` (longest common subsequence). */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.length * b.length > DIFF_TOKEN_LIMIT ** 2)
    return merge([
      { kind: "del", text: before },
      { kind: "add", text: after },
    ]);
  const n = a.length;
  const m = b.length;
  // dp[i][j]: the longest common run of a[i..] and b[j..].
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      parts.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      parts.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  for (; i < n; i++) parts.push({ kind: "del", text: a[i]! });
  for (; j < m; j++) parts.push({ kind: "add", text: b[j]! });
  return merge(parts);
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run lib/corrections.test.ts lib/word-diff.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/corrections.ts lib/corrections.test.ts lib/word-diff.ts lib/word-diff.test.ts tests/corrections.ts
git commit -m "Add the correction rules and a Unicode-safe word diff"
```

---

### Task 4: Status chips, the compare view and the consultation dialog

**Files:**

- Create: `components/corrections/chips.tsx`,
  `components/review/correction-compare.tsx`,
  `components/review/consultation-dialog.tsx`,
  `components/review/correction-compare.test.tsx`
- Test: `components/review/correction-compare.test.tsx`

**Interfaces:**

- Consumes: `STATUS_VIEW`, `OVERDUE_LABEL`, `originalKind` (Task 3);
  `wordDiff`, `DiffPart` (Task 3); `citationTag`, `RESULT_LABEL`
  (`lib/labels.ts`); `Chip`, `Dialog`, `Button` (`components/ui`).
- Produces:
  - `StatusChip({ status }: { status: CorrectionStatus })`: word plus icon;
  - `OriginalChip({ original, prefix }: { original: Pick<CorrectionOriginalOut, "decision" | "degraded">; prefix?: string })`;
  - `OverdueChip()`: "Over 4 h" with a clock, and " waiting" for screen
    readers;
  - `DiffText({ parts, side }: { parts: DiffPart[]; side: "before" | "after" })`;
  - `CorrectionCompare({ c, mine }: { c: CorrectionOut; mine: boolean })`:
    regions "What the system said", "Suggested correction" (or "Your
    correction"), "Why (from {name})" (or "Your reason"), "Evidence on file";
  - `ConsultationDialog({ c, mine, open, onClose }: { c: CorrectionOut; mine: boolean; open: boolean; onClose(): void })`:
    a dialog titled "The consultation".

**Behaviour (review-queue.html 1, mobile E):** two columns from `md`, stacked
below; removed words struck through in the left column, added words
underlined in the right one, each with a hidden "Removed:" or "Added:" and a
visible legend; evidence rows use the result screen's tags ("Verified",
"Needs review", "Removed: unsupported").

- [ ] **Step 1: Write the failing tests**

`components/review/correction-compare.test.tsx`:

```tsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { makeCorrection } from "@/tests/corrections";
import { OriginalChip, OverdueChip, StatusChip } from "../corrections/chips";
import { ConsultationDialog } from "./consultation-dialog";
import { CorrectionCompare } from "./correction-compare";

const asthma = () => {
  const c = makeCorrection({ corrected_diagnosis: "Acute asthma, severe" });
  c.original.diagnosis = "Acute asthma, moderate";
  return c;
};

describe("CorrectionCompare", () => {
  it("marks what changed with a text cue, not colour alone", () => {
    render(<CorrectionCompare c={asthma()} mine={false} />);
    const before = screen.getByRole("region", { name: "What the system said" });
    const after = screen.getByRole("region", { name: "Suggested correction" });
    expect(before.querySelector("del")).toHaveTextContent("Removed: moderate");
    expect(before.querySelector("ins")).toBeNull();
    expect(after.querySelector("ins")).toHaveTextContent("Added: severe");
    expect(after.querySelector("del")).toBeNull();
    expect(before).toHaveTextContent("Acute asthma, Removed: moderate");
    expect(screen.getByText(/struck through/)).toBeVisible();
  });

  it("says who suggested it and why, and lists the evidence in words", () => {
    render(<CorrectionCompare c={makeCorrection()} mine={false} />);
    expect(
      screen.getByRole("region", { name: "Why (from Dr. Okafor)" }),
    ).toHaveTextContent("Persistent vomiting is a warning sign.");
    const evidence = screen.getByRole("region", { name: "Evidence on file" });
    const rows = within(evidence).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Verified");
    expect(rows[0]).toHaveTextContent(
      "WHO Dengue Guidelines 2024 · NS1 antigen test",
    );
    expect(rows[1]).toHaveTextContent("Needs review");
  });

  it("calls it yours when it is", () => {
    render(<CorrectionCompare c={makeCorrection()} mine />);
    expect(
      screen.getByRole("region", { name: "Your correction" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Your reason" })).toBeVisible();
  });

  it("shows the whole correction as added when the system gave no diagnosis", () => {
    const c = makeCorrection();
    c.original.diagnosis = null;
    c.original.citations = [];
    render(<CorrectionCompare c={c} mine={false} />);
    expect(screen.getByText("No diagnosis was given.")).toBeVisible();
    expect(
      screen
        .getByRole("region", { name: "Suggested correction" })
        .querySelector("ins"),
    ).toHaveTextContent("Dengue fever with warning signs: admit");
    expect(screen.getByText("No sources were cited.")).toBeVisible();
  });

  it("wraps very long and mixed-script text without losing any (Review Focus 5)", () => {
    const long = `${"x".repeat(2000)} 🙂 Café حمى ${"y".repeat(600)}`;
    render(
      <CorrectionCompare
        c={makeCorrection({ corrected_diagnosis: long, reason: long })}
        mine={false}
      />,
    );
    const after = screen.getByRole("region", { name: "Suggested correction" });
    const text = after.querySelector("p")!;
    // Every changed run carries a hidden "Added: "; the rest is the text itself.
    expect(text.textContent!.split("Added: ").join("")).toBe(long);
    expect(text.className).toContain("[overflow-wrap:anywhere]");
    const why = screen.getByRole("region", { name: "Why (from Dr. Okafor)" });
    expect(why.querySelector("p")!.className).toContain(
      "[overflow-wrap:anywhere]",
    );
  });
});

describe("chips", () => {
  it("pair every status with a word", () => {
    render(
      <>
        <StatusChip status="pending_review" />
        <StatusChip status="approved" />
        <StatusChip status="rejected" />
        <StatusChip status="withdrawn" />
        <OriginalChip
          original={{ decision: "PASS", degraded: true }}
          prefix="Original: "
        />
        <OverdueChip />
      </>,
    );
    for (const w of ["Waiting", "Approved", "Rejected", "Withdrawn"])
      expect(screen.getByText(w)).toBeVisible();
    // Degraded is never shown as a confidence level.
    expect(screen.getByText("Original: Needs review")).toBeVisible();
    expect(screen.getByText(/Over 4 h/)).toHaveTextContent("Over 4 h waiting");
  });
});

function DialogHost() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <ConsultationDialog
        c={makeCorrection()}
        mine={false}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

describe("ConsultationDialog", () => {
  it("shows the question as asked and the system's full answer, read only", async () => {
    const user = userEvent.setup();
    render(<DialogHost />);
    await user.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog", { name: "The consultation" });
    expect(dialog).toHaveTextContent(
      "Fever 3 days and rash, dengue area. Admit?",
    );
    expect(dialog).toHaveTextContent("24 years, female");
    expect(dialog).toHaveTextContent("Fever, Rash");
    expect(dialog).toHaveTextContent(
      "Admit if platelets fall below 100 × 10⁹/L",
    );
    expect(dialog).toHaveTextContent("Original: Use with caution");
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/review/correction-compare.test.tsx`
Expected: FAIL: the component modules can't be resolved.

- [ ] **Step 3: Write the chips**

`components/corrections/chips.tsx`:

```tsx
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  OctagonAlert,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import type {
  CorrectionOriginalOut,
  CorrectionStatus,
} from "@/lib/api/contract";
import { OVERDUE_LABEL, STATUS_VIEW, originalKind } from "@/lib/corrections";
import { RESULT_LABEL } from "@/lib/labels";
import { Chip } from "../ui/chip";

const STATUS_ICON = {
  pending_review: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  withdrawn: Undo2,
} as const;

const KIND = {
  high: { tone: "ok", Icon: ShieldCheck },
  caution: { tone: "warn", Icon: AlertTriangle },
  review: { tone: "bad", Icon: OctagonAlert },
} as const;

/** Waiting / Approved / Rejected / Withdrawn: always a word and an icon. */
export function StatusChip({ status }: { status: CorrectionStatus }) {
  const { label, tone } = STATUS_VIEW[status];
  const Icon = STATUS_ICON[status];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {label}
    </Chip>
  );
}

/** How the system rated its answer, in the result screen's words. */
export function OriginalChip({
  original,
  prefix = "",
}: {
  original: Pick<CorrectionOriginalOut, "decision" | "degraded">;
  prefix?: string;
}) {
  const kind = originalKind(original);
  const { tone, Icon } = KIND[kind];
  return (
    <Chip tone={tone}>
      <Icon aria-hidden className="size-3" />
      {prefix}
      {RESULT_LABEL[kind]}
    </Chip>
  );
}

export function OverdueChip() {
  return (
    <Chip tone="bad">
      <Clock aria-hidden className="size-3" />
      {OVERDUE_LABEL}
      <span className="sr-only"> waiting</span>
    </Chip>
  );
}
```

- [ ] **Step 4: Write the compare view**

`components/review/correction-compare.tsx`:

```tsx
import { PenLine } from "lucide-react";
import { useId } from "react";
import type { CorrectionOut } from "@/lib/api/contract";
import { citationTag } from "@/lib/labels";
import { wordDiff, type DiffPart } from "@/lib/word-diff";
import { Chip } from "../ui/chip";

const WRAP = "[overflow-wrap:anywhere] whitespace-pre-line";
const H = "mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[.1em]";
const BOX =
  "rounded-[18px] border border-line bg-white px-[18px] py-4 text-[14px] leading-relaxed text-ink-2";

/** One side of the diff. Changes carry a hidden word as well as the styling. */
export function DiffText({
  parts,
  side,
}: {
  parts: DiffPart[];
  side: "before" | "after";
}) {
  const hidden = side === "before" ? "add" : "del";
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === hidden) return null;
        if (p.kind === "same" || !p.text.trim())
          return <span key={i}>{p.text}</span>;
        return p.kind === "del" ? (
          <del
            key={i}
            className="rounded bg-bad-wash px-0.5 text-bad-deep decoration-bad decoration-2"
          >
            <span className="sr-only">Removed: </span>
            {p.text}
          </del>
        ) : (
          <ins
            key={i}
            className="rounded bg-[#c9ece4] px-0.5 text-ok-deep underline decoration-2 underline-offset-2"
          >
            <span className="sr-only">Added: </span>
            {p.text}
          </ins>
        );
      })}
    </>
  );
}

/** What the system said beside the correction, then why and the evidence. */
export function CorrectionCompare({
  c,
  mine,
}: {
  c: CorrectionOut;
  mine: boolean;
}) {
  const id = useId();
  const parts = wordDiff(c.original.diagnosis ?? "", c.corrected_diagnosis);
  const correction = mine ? "Your correction" : "Suggested correction";
  const why = mine
    ? "Your reason"
    : `Why (from ${c.submitted_by.display_name})`;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 md:grid-cols-2">
        <section aria-labelledby={`${id}-a`} className={BOX}>
          <h3 id={`${id}-a`} className={`${H} text-ink-3`}>
            What the system said
          </h3>
          {c.original.diagnosis ? (
            <p className={WRAP}>
              <DiffText parts={parts} side="before" />
            </p>
          ) : (
            <p className="text-ink-3">No diagnosis was given.</p>
          )}
        </section>
        <section
          aria-labelledby={`${id}-b`}
          className="rounded-[18px] border border-[#bfe3e3] bg-mint-wash px-[18px] py-4 text-[14px] leading-relaxed text-ink"
        >
          <h3 id={`${id}-b`} className={`${H} text-mint-deep`}>
            <PenLine aria-hidden className="size-3.5" />
            {correction}
          </h3>
          <p className={WRAP}>
            <DiffText parts={parts} side="after" />
          </p>
        </section>
      </div>
      <p className="text-[12px] text-ink-3">
        Changes: <del className="decoration-bad">struck through</del> was
        removed, <ins className="underline underline-offset-2">underlined</ins>{" "}
        was added.
      </p>
      <div className="grid gap-3.5 md:grid-cols-2">
        <section aria-labelledby={`${id}-c`} className={BOX}>
          <h3 id={`${id}-c`} className={`${H} text-ink-3`}>
            {why}
          </h3>
          <p className={WRAP}>{c.reason}</p>
        </section>
        <section aria-labelledby={`${id}-d`} className={BOX}>
          <h3 id={`${id}-d`} className={`${H} text-ink-3`}>
            Evidence on file
          </h3>
          {c.original.citations.length ? (
            <ul className="flex flex-col gap-2 text-[13px]">
              {c.original.citations.map((s, i) => {
                const tag = citationTag(s.action);
                return (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-2 border-t border-line pt-2 first:border-0 first:pt-0"
                  >
                    <Chip tone={tag.tone}>{tag.label}</Chip>
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      <b className="font-semibold">{s.source_title}</b> ·{" "}
                      {s.claim_text}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-3">No sources were cited.</p>
          )}
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the consultation dialog**

`components/review/consultation-dialog.tsx`:

```tsx
"use client";
import type { CorrectionOut } from "@/lib/api/contract";
import { OriginalChip } from "../corrections/chips";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

const SEX = {
  female: "female",
  male: "male",
  other: "other",
  unknown: "sex not given",
} as const;
const URGENCY = {
  routine: "Routine",
  urgent: "Urgent",
  emergency: "Emergency",
} as const;
const H =
  "mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-3";

/** Read only (R7): built from the correction, because the reviewer can't open /c/{id}. */
export function ConsultationDialog({
  c,
  mine,
  open,
  onClose,
}: {
  c: CorrectionOut;
  mine: boolean;
  open: boolean;
  onClose(): void;
}) {
  const q = c.consultation;
  return (
    <Dialog open={open} onClose={onClose} title="The consultation">
      <p className="text-[13px] text-ink-3">
        {mine ? "Your consultation, as you asked it." : "Read only."}
      </p>
      <div className="max-h-[60vh] overflow-auto text-[14px] [overflow-wrap:anywhere]">
        <h3 className={H}>As asked</h3>
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-y-1.5 text-[13.5px]">
          <dt className="text-ink-3">Patient</dt>
          <dd>
            {q.age} years, {SEX[q.sex]}
          </dd>
          <dt className="text-ink-3">Symptoms</dt>
          <dd>{q.symptoms.join(", ") || "None given"}</dd>
          <dt className="text-ink-3">Urgency</dt>
          <dd>{URGENCY[q.urgency]}</dd>
          {q.specialty && (
            <>
              <dt className="text-ink-3">Specialty</dt>
              <dd>{q.specialty}</dd>
            </>
          )}
        </dl>
        <p className="mt-2 whitespace-pre-line">{q.clinical_question}</p>
        <h3 className={H}>What the system said</h3>
        <OriginalChip original={c.original} prefix="Original: " />
        {c.original.diagnosis && (
          <p className="mt-2 font-semibold">{c.original.diagnosis}</p>
        )}
        <p className="mt-1 whitespace-pre-line text-ink-2">
          {c.original.response_text}
        </p>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/review/correction-compare.test.tsx lib/motion.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/corrections/chips.tsx components/review
git commit -m "Add the correction compare view, status chips and consultation dialog"
```

---

### Task 5: Query hooks for corrections

**Files:**

- Create: `lib/correction-queries.ts`, `lib/correction-queries.test.tsx`
- Modify: `lib/queries.ts` (`useFeedback` refreshes the correction lists)
- Test: `lib/correction-queries.test.tsx`; the existing `lib/queries.test.tsx` must still pass

**Interfaces:**

- Consumes: `getClient` and the Task 1 methods; `ApiError`; `useNetwork`,
  `shouldRetry`, `retryDelay` (`lib/network.ts`).
- Produces:
  - `REVIEW_POLL_MS` (60 000) and `DECISION_POLL_MS` (30 000);
  - `CORRECTION_KEYS = { all, pending, mine, reviewed, stats }`
    (`["corrections"]`, `["corrections","pending"]`,
    `["corrections","mine"]`, `["corrections","reviewed"]`,
    `["feedback-stats"]`);
  - `refreshCorrections(qc: QueryClient): Promise<void>`;
  - `usePendingCorrections()`, `useMyCorrections()`, `useMyReviews()`,
    `useFeedbackStats()`: `UseQueryResult` of `CorrectionOut[]` or
    `FeedbackStatsOut`;
  - `useReviewBadge(): { count: number | null; forbidden: boolean }`;
  - `useRejectCorrection()`: a mutation whose `mutate({ id, r }, options?)`
    adds a fresh `Idempotency-Key`;
  - `useWithdrawCorrection()`: the same with `mutate({ id }, options?)`.

**Rules:**

- The queue (and the sidebar badge) poll every `REVIEW_POLL_MS`; your own
  corrections every `DECISION_POLL_MS` (R9). Both double on 2G or data
  saver and stop while offline. TanStack Query already skips intervals in
  background tabs (`refetchIntervalInBackground` stays false).
- A 403 on the queue means reviewing isn't available (R3): no retry and no
  more polling.
- Reject and withdraw retry network errors and 5xx twice with the same
  key, never while offline (R8), and refresh every correction list and the
  stats when they settle.

- [ ] **Step 1: Write the failing tests**

`lib/correction-queries.test.tsx`:

```tsx
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthTestProvider } from "@/tests/auth-wrapper";

const api = vi.hoisted(() => ({
  listPendingCorrections: vi.fn(),
  listMyCorrections: vi.fn(),
  listMyReviews: vi.fn(),
  getMyFeedbackStats: vi.fn(),
  rejectCorrection: vi.fn(),
  withdrawCorrection: vi.fn(),
  approveCorrection: vi.fn(),
  sendFeedback: vi.fn(),
}));
vi.mock("./api/client", () => ({ getClient: () => api }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { ApiError } from "./api/errors";
import {
  CORRECTION_KEYS,
  REVIEW_POLL_MS,
  useMyCorrections,
  usePendingCorrections,
  useRejectCorrection,
  useReviewBadge,
  useWithdrawCorrection,
} from "./correction-queries";
import { OutboxProvider } from "./offline/outbox-context";
import { useFeedback } from "./queries";

const wrap = () => {
  const qc = new QueryClient();
  return {
    qc,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
};
const setOnline = (on: boolean) => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(on);
  act(() => void window.dispatchEvent(new Event(on ? "online" : "offline")));
};

beforeEach(() => {
  for (const f of Object.values(api)) f.mockReset();
  api.listPendingCorrections.mockResolvedValue([]);
  api.listMyCorrections.mockResolvedValue([]);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("correction queries", () => {
  it("polls the queue every minute online, and not at all offline", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => usePendingCorrections(), { wrapper: wrap().wrapper });
    await waitFor(() =>
      expect(api.listPendingCorrections).toHaveBeenCalledTimes(1),
    );
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    expect(api.listPendingCorrections).toHaveBeenCalledTimes(2);
    setOnline(false);
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS * 3));
    expect(api.listPendingCorrections).toHaveBeenCalledTimes(2);
  });

  it("polls your own corrections more often, for decisions", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useMyCorrections(), { wrapper: wrap().wrapper });
    await waitFor(() => expect(api.listMyCorrections).toHaveBeenCalledTimes(1));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(api.listMyCorrections).toHaveBeenCalledTimes(2);
  });

  it("counts others' waiting corrections for the badge", async () => {
    api.listPendingCorrections.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    const { result } = renderHook(() => useReviewBadge(), {
      wrapper: wrap().wrapper,
    });
    expect(result.current).toEqual({ count: null, forbidden: false });
    await waitFor(() =>
      expect(result.current).toEqual({ count: 2, forbidden: false }),
    );
  });

  it("says forbidden on a 403, without retrying or polling again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    api.listPendingCorrections.mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    const { result } = renderHook(() => useReviewBadge(), {
      wrapper: wrap().wrapper,
    });
    await waitFor(() => expect(result.current.forbidden).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS * 3));
    expect(api.listPendingCorrections).toHaveBeenCalledTimes(1);
  });

  it("rejects with one key across a retry, then refreshes the lists", async () => {
    api.rejectCorrection
      .mockRejectedValueOnce(new ApiError(503, "unavailable"))
      .mockResolvedValueOnce(undefined);
    const { qc, wrapper } = wrap();
    const refresh = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRejectCorrection(), { wrapper });
    act(() =>
      result.current.mutate({ id: "c1", r: { reason_code: "unsafe" } }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = api.rejectCorrection.mock.calls.map(
      (c) => (c[2] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(api.rejectCorrection.mock.calls[0]?.slice(0, 2)).toEqual([
      "c1",
      { reason_code: "unsafe" },
    ]);
    expect(refresh).toHaveBeenCalledWith({ queryKey: CORRECTION_KEYS.all });
    expect(refresh).toHaveBeenCalledWith({ queryKey: CORRECTION_KEYS.stats });
  });

  it("uses a new key for each withdraw, and never retries offline", async () => {
    api.withdrawCorrection.mockResolvedValue(undefined);
    const { result } = renderHook(() => useWithdrawCorrection(), {
      wrapper: wrap().wrapper,
    });
    act(() => result.current.mutate({ id: "c1" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    act(() => result.current.mutate({ id: "c1" }));
    await waitFor(() =>
      expect(api.withdrawCorrection).toHaveBeenCalledTimes(2),
    );
    const [k1, k2] = api.withdrawCorrection.mock.calls.map(
      (c) => (c[1] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(k1).not.toBe(k2);

    setOnline(false);
    api.withdrawCorrection.mockReset();
    api.withdrawCorrection.mockRejectedValue(new ApiError(0, "network"));
    act(() => result.current.mutate({ id: "c2" }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.withdrawCorrection).toHaveBeenCalledTimes(1);
  });

  it("refreshes your corrections after you send a correction", async () => {
    api.sendFeedback.mockResolvedValue({
      status: "pending_review",
      correction_id: "c9",
    });
    const { result } = renderHook(
      () => ({ fb: useFeedback(), qc: useQueryClient() }),
      {
        wrapper: ({ children }: { children: ReactNode }) => (
          <AuthTestProvider>
            <OutboxProvider>{children}</OutboxProvider>
          </AuthTestProvider>
        ),
      },
    );
    const refresh = vi.spyOn(result.current.qc, "invalidateQueries");
    await act(async () => {
      await result.current.fb.mutateAsync({
        query_id: "q1",
        action: "correct",
        corrected_diagnosis: "abc",
        reason: "abc",
      });
    });
    expect(refresh).toHaveBeenCalledWith({ queryKey: CORRECTION_KEYS.all });
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/correction-queries.test.tsx`
Expected: FAIL: `./correction-queries` can't be resolved.

- [ ] **Step 3: Write the hooks**

`lib/correction-queries.ts`:

```ts
"use client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getClient } from "./api/client";
import type { RejectIn } from "./api/contract";
import { ApiError } from "./api/errors";
import { retryDelay, shouldRetry, useNetwork } from "./network";

/** The queue and the sidebar badge. */
export const REVIEW_POLL_MS = 60_000;
/** Your own corrections: how decisions reach you (spec §10 item 1, R9). */
export const DECISION_POLL_MS = 30_000;

export const CORRECTION_KEYS = {
  all: ["corrections"] as const,
  pending: ["corrections", "pending"] as const,
  mine: ["corrections", "mine"] as const,
  reviewed: ["corrections", "reviewed"] as const,
  stats: ["feedback-stats"] as const,
};

const forbidden = (e: unknown) => e instanceof ApiError && e.status === 403;
// A 4xx won't change on retry; a 401 has already signed out.
const READ_RETRY = {
  retry: (n: number, e: unknown) => shouldRetry(n, e),
  retryDelay,
};

/** Only while online; half as often on 2G or data saver. */
function usePollEvery(ms: number): number | false {
  const net = useNetwork();
  if (!net.online) return false;
  return net.slow || net.saveData ? ms * 2 : ms;
}

export async function refreshCorrections(qc: QueryClient): Promise<void> {
  await Promise.all([
    qc.invalidateQueries({ queryKey: CORRECTION_KEYS.all }),
    qc.invalidateQueries({ queryKey: CORRECTION_KEYS.stats }),
  ]);
}

export function usePendingCorrections() {
  const every = usePollEvery(REVIEW_POLL_MS);
  return useQuery({
    queryKey: CORRECTION_KEYS.pending,
    queryFn: () => getClient().listPendingCorrections(),
    refetchInterval: (q) => (forbidden(q.state.error) ? false : every),
    ...READ_RETRY,
  });
}

export function useMyCorrections() {
  const every = usePollEvery(DECISION_POLL_MS);
  return useQuery({
    queryKey: CORRECTION_KEYS.mine,
    queryFn: () => getClient().listMyCorrections(),
    refetchInterval: every,
    ...READ_RETRY,
  });
}

export function useMyReviews() {
  return useQuery({
    queryKey: CORRECTION_KEYS.reviewed,
    queryFn: () => getClient().listMyReviews(),
    ...READ_RETRY,
  });
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: CORRECTION_KEYS.stats,
    queryFn: () => getClient().getMyFeedbackStats(),
    staleTime: 60_000,
    ...READ_RETRY,
  });
}

/** Others' waiting corrections, for the sidebar; `forbidden` hides the entry (R3). */
export function useReviewBadge(): { count: number | null; forbidden: boolean } {
  const q = usePendingCorrections();
  return {
    count: q.data ? q.data.length : null,
    forbidden: forbidden(q.error),
  };
}

// Decisions retry network errors and 5xx with the same key, never offline (R8).
const WRITE_RETRY = {
  networkMode: "always" as const,
  retry: (n: number, e: unknown) => navigator.onLine && shouldRetry(n, e, 2),
  retryDelay,
};

export function useRejectCorrection() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ id, r, key }: { id: string; r: RejectIn; key: string }) =>
      getClient().rejectCorrection(id, r, { idempotencyKey: key }),
    ...WRITE_RETRY,
    onSettled: () => refreshCorrections(qc),
  });
  return {
    ...m,
    mutate: (
      v: { id: string; r: RejectIn },
      options?: Parameters<typeof m.mutate>[1],
    ) => m.mutate({ ...v, key: crypto.randomUUID() }, options),
  };
}

export function useWithdrawCorrection() {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) =>
      getClient().withdrawCorrection(id, { idempotencyKey: key }),
    ...WRITE_RETRY,
    onSettled: () => refreshCorrections(qc),
  });
  return {
    ...m,
    mutate: (v: { id: string }, options?: Parameters<typeof m.mutate>[1]) =>
      m.mutate({ ...v, key: crypto.randomUUID() }, options),
  };
}
```

- [ ] **Step 4: Refresh the lists after a correction is sent**

In `lib/queries.ts`:

- add `useQueryClient` to the `@tanstack/react-query` import, and
  `import { refreshCorrections } from "./correction-queries";`;
- in `useFeedback`, add `const qc = useQueryClient();` before `useMutation`,
  and this option after `retryDelay,`:

```ts
    // A sent correction shows in My corrections; a queued one isn't sent yet.
    onSuccess: (r) => {
      if (r.status !== "queued") void refreshCorrections(qc);
    },
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run lib/correction-queries.test.tsx lib/queries.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/correction-queries.ts lib/correction-queries.test.tsx lib/queries.ts
git commit -m "Add polling hooks and retry-safe mutations for corrections"
```

---

### Task 6: Decision toasts and the bell

**Files:**

- Create: `components/corrections/decisions-provider.tsx`,
  `components/corrections/decision-bell.tsx`,
  `components/corrections/decisions.test.tsx`
- Modify: `components/shell/app-shell.tsx` (wraps the shell in
  `DecisionsProvider`), `components/shell/top-bar.tsx` (shows
  `DecisionBell`), `CHANGELOG.md`
- Test: `components/corrections/decisions.test.tsx`; the existing shell, states and consultation suites must still pass

**Interfaces:**

- Consumes: `useMyCorrections`, `CORRECTION_KEYS` (Task 5);
  `correctionTitle`, `parseTime`, `rejectionText`, `ageLabel` (Task 3);
  `StatusChip` (Task 4); `useToast` (`show({ title, body, tone, ms })`);
  `useNow` (`lib/hooks/use-now.ts`).
- Produces:
  - `interface DecisionNote { id: string; status: "approved" | "rejected"; title: string; by: string | null; reason: string | null; at: number }`;
  - `NOTES_KEPT` (50);
  - `newDecisions(prev: Map<string, CorrectionStatus> | null, next: CorrectionOut[], since: number, now: number): DecisionNote[]`
    (pure: the first look, `prev === null`, is only a baseline);
  - `toastFor(d: DecisionNote): { title: string; body: string; tone: "ok" | "info"; ms: number }`;
  - `DecisionsProvider({ children })` and
    `useDecisions(): { notes: DecisionNote[]; unseen: number; markSeen(): void } | null`
    (null outside the provider);
  - `DecisionBell()`: renders nothing outside the provider.

**Behaviour (states-and-export.html 7):**

- The provider keeps `GET /corrections/mine` polling (R9) and listens to the
  query cache. When a correction of yours turns approved or rejected
  between two looks (or appears already decided, decided after the
  provider started), it adds a note and shows a toast for 8 seconds:
  - "Your correction was approved" · "{title} · {reviewer}";
  - "Your correction was rejected" · "{title} · Reason: {reason}".
- The bell sits at the end of every top bar. Its name says how many are
  new: "Decisions on your corrections, 2 new"; the count is also shown as a
  number. Opening it marks them seen and shows "Decisions this session"
  (status chip, title, reviewer and age, the reason for a rejection), a
  link "My feedback & corrections", and "Kept for this session only." Esc
  and clicking outside close it and return focus to the bell.

- [ ] **Step 1: Write the failing tests**

`components/corrections/decisions.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CorrectionOut } from "@/lib/api/contract";
import { CORRECTION_KEYS } from "@/lib/correction-queries";
import { T0, makeCorrection } from "@/tests/corrections";
import { ToastProvider } from "../ui/toast";

const listMine = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyCorrections: listMine }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { DecisionBell } from "./decision-bell";
import { DecisionsProvider, newDecisions } from "./decisions-provider";

const reviewer = {
  display_name: "Dr. Bello",
  full_name: null,
  specialty: null,
  hospital: null,
};
const waiting = makeCorrection({ id: "c1" });
const approved: CorrectionOut = {
  ...waiting,
  status: "approved",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
};
const rejected: CorrectionOut = {
  ...makeCorrection({ id: "c2" }),
  status: "rejected",
  decided_by: reviewer,
  decided_at: new Date(T0).toISOString(),
  rejection: { reason_code: "unsafe", note: "Dose too high." },
};

function ui() {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <DecisionsProvider>
          <DecisionBell />
          <button>elsewhere</button>
        </DecisionsProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return qc;
}
const poll = (qc: QueryClient) =>
  act(() => qc.invalidateQueries({ queryKey: CORRECTION_KEYS.mine }));

beforeEach(() => listMine.mockReset());

describe("newDecisions", () => {
  const since = T0 - 60_000;
  it("treats the first look as a baseline", () => {
    expect(newDecisions(null, [approved], since, T0)).toEqual([]);
  });
  it("notes a waiting correction that was decided", () => {
    const prev = new Map([["c1", "pending_review" as const]]);
    expect(newDecisions(prev, [approved], since, T0)).toEqual([
      {
        id: "c1",
        status: "approved",
        title: "Dengue fever, likely",
        by: "Dr. Bello",
        reason: null,
        at: T0,
      },
    ]);
  });
  it("notes a new one only if it was decided after we started", () => {
    const prev = new Map<string, CorrectionOut["status"]>();
    expect(newDecisions(prev, [rejected], since, T0)[0]).toMatchObject({
      status: "rejected",
      reason: "Unsafe: Dose too high.",
    });
    const old = { ...rejected, decided_at: new Date(since - 1).toISOString() };
    expect(newDecisions(prev, [old], since, T0)).toEqual([]);
  });
  it("ignores withdrawals and unchanged decisions", () => {
    const prev = new Map([
      ["c1", "approved" as const],
      ["c3", "pending_review" as const],
    ]);
    const withdrawn = {
      ...makeCorrection({ id: "c3" }),
      status: "withdrawn" as const,
    };
    expect(newDecisions(prev, [approved, withdrawn], since, T0)).toEqual([]);
  });
});

describe("decision toasts and the bell", () => {
  it("never toasts decisions that were already there at sign-in", async () => {
    listMine.mockResolvedValue([approved]);
    ui();
    expect(
      await screen.findByRole("button", {
        name: "Decisions on your corrections",
      }),
    ).toBeVisible();
    await act(() => Promise.resolve());
    expect(screen.queryByText("Your correction was approved")).toBeNull();
  });

  it("toasts a new decision, counts it on the bell, and lists it there", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValueOnce([waiting]);
    const qc = ui();
    await vi.waitFor(() => expect(listMine).toHaveBeenCalledTimes(1));
    listMine.mockResolvedValueOnce([approved]);
    await poll(qc);
    expect(
      await screen.findByText("Your correction was approved"),
    ).toBeVisible();
    expect(screen.getByText("Dengue fever, likely · Dr. Bello")).toBeVisible();
    const bell = screen.getByRole("button", {
      name: "Decisions on your corrections, 1 new",
    });
    await user.click(bell);
    const panel = screen.getByRole("region", {
      name: "Decisions this session",
    });
    expect(within(panel).getByText("Approved")).toBeVisible();
    expect(within(panel).getByText("Dengue fever, likely")).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: "My feedback & corrections" }),
    ).toHaveAttribute("href", "/my-feedback");
    expect(
      within(panel).getByText("Kept for this session only."),
    ).toBeVisible();
    expect(bell).toHaveAccessibleName("Decisions on your corrections");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("region", { name: "Decisions this session" }),
    ).toBeNull();
    expect(bell).toHaveFocus();
  });

  it("shows the reviewer's reason for a rejection", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValueOnce([
      {
        ...rejected,
        status: "pending_review",
        rejection: null,
        decided_at: null,
        decided_by: null,
      },
    ]);
    const qc = ui();
    await vi.waitFor(() => expect(listMine).toHaveBeenCalledTimes(1));
    listMine.mockResolvedValueOnce([rejected]);
    await poll(qc);
    expect(
      await screen.findByText("Your correction was rejected"),
    ).toBeVisible();
    expect(
      screen.getByText("Dengue fever, likely · Reason: Unsafe: Dose too high."),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /1 new/ }));
    expect(
      within(
        screen.getByRole("region", { name: "Decisions this session" }),
      ).getByText("Reason: Unsafe: Dose too high."),
    ).toBeVisible();
  });

  it("closes when you click elsewhere, and says when there's nothing yet", async () => {
    const user = userEvent.setup();
    listMine.mockResolvedValue([]);
    ui();
    await user.click(
      await screen.findByRole("button", {
        name: "Decisions on your corrections",
      }),
    );
    expect(screen.getByText(/No decisions yet/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(
      screen.queryByRole("region", { name: "Decisions this session" }),
    ).toBeNull();
  });

  it("keeps the history in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    listMine.mockResolvedValueOnce([waiting]);
    const qc = ui();
    await vi.waitFor(() => expect(listMine).toHaveBeenCalledTimes(1));
    listMine.mockResolvedValueOnce([approved]);
    await poll(qc);
    await screen.findByText("Your correction was approved");
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it("renders no bell outside the provider", () => {
    const { container } = render(<DecisionBell />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/corrections/decisions.test.tsx`
Expected: FAIL: `./decision-bell` and `./decisions-provider` can't be
resolved.

- [ ] **Step 3: Write the provider**

`components/corrections/decisions-provider.tsx`:

```tsx
"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CorrectionOut, CorrectionStatus } from "@/lib/api/contract";
import { CORRECTION_KEYS, useMyCorrections } from "@/lib/correction-queries";
import { correctionTitle, parseTime, rejectionText } from "@/lib/corrections";
import { useToast } from "../ui/toast";

export interface DecisionNote {
  id: string;
  status: "approved" | "rejected";
  title: string;
  by: string | null;
  reason: string | null;
  at: number;
}

export const NOTES_KEPT = 50;

type Ctx = { notes: DecisionNote[]; unseen: number; markSeen(): void };
const DecisionsCtx = createContext<Ctx | null>(null);

/** Null outside a signed-in shell, so the bell can render nothing there. */
export const useDecisions = () => useContext(DecisionsCtx);

/** Decisions that are new since the last look. The first look is a baseline. */
export function newDecisions(
  prev: Map<string, CorrectionStatus> | null,
  next: CorrectionOut[],
  since: number,
  now: number,
): DecisionNote[] {
  if (!prev) return [];
  return next.flatMap((c): DecisionNote[] => {
    if (c.status !== "approved" && c.status !== "rejected") return [];
    const before = prev.get(c.id);
    const decidedAt = parseTime(c.decided_at);
    const fresh =
      before === "pending_review" ||
      (before === undefined && decidedAt !== null && decidedAt >= since);
    if (!fresh) return [];
    return [
      {
        id: c.id,
        status: c.status,
        title: correctionTitle(c),
        by: c.decided_by?.display_name ?? null,
        reason: c.status === "rejected" ? rejectionText(c.rejection) : null,
        at: decidedAt ?? now,
      },
    ];
  });
}

export function toastFor(d: DecisionNote) {
  return d.status === "approved"
    ? {
        title: "Your correction was approved",
        body: [d.title, d.by].filter(Boolean).join(" · "),
        tone: "ok" as const,
        ms: 8000,
      }
    : {
        title: "Your correction was rejected",
        body: [d.title, d.reason ? `Reason: ${d.reason}` : null]
          .filter(Boolean)
          .join(" · "),
        tone: "info" as const,
        ms: 8000,
      };
}

/**
 * Watches your corrections while you're signed in (it lives in AppShell) and
 * tells you when a reviewer decides. Memory only: the history goes when the
 * shell unmounts at sign-out.
 */
export function DecisionsProvider({ children }: { children: ReactNode }) {
  useMyCorrections(); // keeps the poll running on every clinical screen
  const qc = useQueryClient();
  const { show } = useToast();
  const [since] = useState(() => Date.now());
  const [notes, setNotes] = useState<DecisionNote[]>([]);
  const [unseen, setUnseen] = useState(0);
  const prev = useRef<Map<string, CorrectionStatus> | null>(null);

  useEffect(() => {
    const snapshot = (list: CorrectionOut[]) =>
      new Map(list.map((c) => [c.id, c.status]));
    const cached = qc.getQueryData<CorrectionOut[]>(CORRECTION_KEYS.mine);
    if (cached) prev.current = snapshot(cached);
    // Subscribing to the cache (not an effect on `data`) sees every answer,
    // including ones that arrive while another screen owns the query.
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated" || e.action.type !== "success") return;
      const [a, b] = e.query.queryKey;
      if (a !== CORRECTION_KEYS.mine[0] || b !== CORRECTION_KEYS.mine[1])
        return;
      const list = (e.query.state.data ?? []) as CorrectionOut[];
      const fresh = newDecisions(prev.current, list, since, Date.now());
      prev.current = snapshot(list);
      if (!fresh.length) return;
      setNotes((n) => [...fresh, ...n].slice(0, NOTES_KEPT));
      setUnseen((u) => u + fresh.length);
      for (const d of fresh) show(toastFor(d));
    });
  }, [qc, show, since]);

  const markSeen = useCallback(() => setUnseen(0), []);
  const value = useMemo(
    () => ({ notes, unseen, markSeen }),
    [notes, unseen, markSeen],
  );
  return (
    <DecisionsCtx.Provider value={value}>{children}</DecisionsCtx.Provider>
  );
}
```

- [ ] **Step 4: Write the bell**

`components/corrections/decision-bell.tsx`:

```tsx
"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ageLabel } from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { StatusChip } from "./chips";
import { useDecisions } from "./decisions-provider";

/** The top bar's bell: this session's decisions on your corrections. */
export function DecisionBell() {
  const d = useDecisions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const now = useNow(60_000);

  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>("[data-panel] a")?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  if (!d) return null;
  const label = d.unseen
    ? `Decisions on your corrections, ${d.unseen} new`
    : "Decisions on your corrections";
  const onKey = (e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          d.markSeen();
        }}
        className="relative grid size-11 place-items-center rounded-xl border border-line bg-white text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep md:size-[34px] md:rounded-[10px]"
      >
        <Bell aria-hidden className="size-4" />
        {d.unseen > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad-deep px-1 font-mono text-[10px] font-bold text-white"
          >
            {d.unseen}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          data-panel
          role="region"
          aria-label="Decisions this session"
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(340px,90vw)] rounded-2xl bg-white p-3 text-left shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <h2 className="px-1 text-[13px] font-semibold">
            Decisions this session
          </h2>
          {d.notes.length ? (
            <ul className="mt-2 flex max-h-[50vh] flex-col overflow-auto">
              {d.notes.map((n) => (
                <li
                  key={`${n.id}-${n.at}`}
                  className="flex flex-col gap-1 border-t border-line px-1 py-2.5 text-[13px] first:border-0"
                >
                  <span className="flex items-center gap-2">
                    <StatusChip status={n.status} />
                    <b className="min-w-0 truncate">{n.title}</b>
                  </span>
                  <small className="text-ink-3">
                    {[n.by, `${ageLabel(n.at, now)} ago`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                  {n.reason && (
                    <small className="text-bad-deep [overflow-wrap:anywhere]">
                      Reason: {n.reason}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 px-1 text-[13px] text-ink-3">
              No decisions yet. When a reviewer decides on a correction you
              suggested, it shows here.
            </p>
          )}
          <Link
            href="/my-feedback"
            onClick={() => setOpen(false)}
            className="mt-2 flex min-h-11 items-center justify-center rounded-xl bg-lilac text-[13px] font-semibold text-bloom"
          >
            My feedback &amp; corrections
          </Link>
          <p className="mt-2 px-1 text-[11px] text-ink-3">
            Kept for this session only.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Mount them in the shell**

In `components/shell/top-bar.tsx`, import
`import { DecisionBell } from "../corrections/decision-bell";` and change
the actions wrapper to:

```tsx
<div className="ml-auto flex items-center gap-2">
  {actions}
  <DecisionBell />
</div>
```

In `components/shell/app-shell.tsx`, import
`import { DecisionsProvider } from "../corrections/decisions-provider";` and
replace the component's `return (…);` with:

```tsx
return (
  <Ctx.Provider value={ctx}>
    {/* Polls your corrections and toasts decisions while signed in (R9). */}
    <DecisionsProvider>
      <div className="grid h-[calc(100dvh-var(--demo-h,0px))] grid-cols-1 md:grid-cols-[76px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)]">
        {/* Sidebar reads usePathname(); with cacheComponents it must sit in Suspense. */}
        <div className="hidden md:block xl:hidden">
          <Suspense fallback={null}>
            <Sidebar items={items} rail onOpenSearch={openSearch} />
          </Suspense>
        </div>
        <div className="hidden xl:block">
          <Suspense fallback={null}>
            <Sidebar items={items} onOpenSearch={openSearch} />
          </Suspense>
        </div>
        <main className="canvas-v3 relative flex min-w-0 flex-col overflow-hidden">
          <OfflineStrip />
          <DegradedStrip />
          {children}
        </main>
      </div>
      <MobileDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        items={items}
        onOpenSearch={openSearch}
      />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsDialog open={keysOpen} onClose={() => setKeysOpen(false)} />
    </DecisionsProvider>
  </Ctx.Provider>
);
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Decisions on your corrections reach you while you work: a toast when a
  reviewer approves or rejects one (with their reason), and a bell in the
  top bar that keeps this session's decisions, in memory only.
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run components/corrections components/shell components/states components/consultation`
Expected: PASS (the shell, states and consultation suites still pass with
the provider in place).

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/corrections components/shell/top-bar.tsx components/shell/app-shell.tsx CHANGELOG.md
git commit -m "Toast decisions on your corrections and keep them in a bell"
```

---

### Task 7: My feedback & corrections

**Files:**

- Create: `components/corrections/withdraw-dialog.tsx`,
  `components/corrections/resubmit-dialog.tsx`,
  `components/corrections/my-corrections-view.tsx`,
  `components/corrections/my-corrections-view.test.tsx`,
  `app/(clinical)/my-feedback/page.tsx`
- Modify: `components/feedback/correction-form.tsx` (optional starting
  values), `components/shell/account-menu.tsx`,
  `components/shell/account-menu.test.tsx`, `CHANGELOG.md`
- Test: `components/corrections/my-corrections-view.test.tsx`, `components/shell/account-menu.test.tsx`

**Interfaces:**

- Consumes: `useMyCorrections`, `useWithdrawCorrection` (Task 5);
  `correctionTitle`, `decisionError`, `isOverdue`, `rejectionText`,
  `statusLine`, `DecisionError` (Task 3); `StatusChip`, `OverdueChip`,
  `CorrectionCompare` (Task 4); `useFeedback` (`lib/queries.ts`);
  `CorrectionForm`; `useNetwork`; `useNow`; `TopBar`, `MenuButton`,
  `Banner`, `Button`, `Dialog`, `Skeleton`, `useToast`.
- Produces:
  - `WithdrawDialog({ open, onClose, onConfirm, busy, error }: { open: boolean; onClose(): void; onConfirm(): void; busy: boolean; error: DecisionError | null })`
    (reused by the review page in Task 11);
  - `ResubmitDialog({ correction, onClose }: { correction: CorrectionOut | null; onClose(): void })`;
  - `MyCorrectionsView()` and the page `/my-feedback`
    ("My feedback & corrections · MHAI");
  - `CorrectionForm` gains `initial?: { corrected_diagnosis: string; reason: string }`;
  - the account menu item "My feedback & corrections" → `/my-feedback`,
    second in the menu (account.html 4).

**Behaviour (states-and-export.html 7, account.html 4, mobile C):**

- Top bar "My feedback & corrections" / "Your account"; heading as the
  mockup; filters "All · N", "Waiting · N", "Approved · N", "Rejected · N"
  (and "Withdrawn · N" once there is one), as toggle buttons.
- One row per correction in a `card-v3` list named "Your corrections":
  - status chip, the title, then `statusLine()`; "Over 4 h" when a waiting
    one is overdue;
  - a rejection shows "Reviewer's reason: “…”" in the bad-wash box;
  - "View" expands the compare view (`aria-expanded`); "Withdraw" on a
    waiting one asks first ("Keep it" is focused and safe); "Resubmit" on a
    rejected one opens the correction form with your text, to change and
    send again (a new `POST /feedback`).
- Offline: "Withdraw" is disabled, described by "You're offline.
  Withdrawing needs a connection."
- Loading: three skeleton rows. Error: a banner and "Try again". Empty:
  "No corrections yet" and what this page will show.

- [ ] **Step 1: Write the failing tests**

`components/corrections/my-corrections-view.test.tsx`:

```tsx
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import { OutboxProvider } from "@/lib/offline/outbox-context";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/my-feedback",
}));
import { MyCorrectionsView } from "./my-corrections-view";

const ui = () =>
  renderWithAuth(
    <ToastProvider>
      <OutboxProvider>
        <MyCorrectionsView />
      </OutboxProvider>
    </ToastProvider>,
  );
const list = () => screen.findByRole("list", { name: "Your corrections" });

beforeEach(() => {
  holder.client = createMockClient();
});
afterEach(() => vi.restoreAllMocks());

describe("MyCorrectionsView", () => {
  it("lists your corrections by status, with the reviewer's reason", async () => {
    ui();
    const rows = within(await list()).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(screen.getByRole("button", { name: "All · 3" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const text = rows.map((r) => r.textContent).join("\n");
    expect(text).toMatch(/Waiting.*Febrile seizure, simple.*Submitted 5 h ago/);
    expect(text).toMatch(/Over 4 h/);
    expect(text).toMatch(/Approved.*Unstable angina.*Approved by Dr\. Okafor/);
    expect(text).toMatch(
      /Rejected.*Hypokalaemia, cause unclear.*Rejected by Nurse Bello/,
    );
    expect(text).toContain(
      'Reviewer\'s reason: “Partly right, needs rewording: Keep "cause unclear"',
    );
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    await user.click(screen.getByRole("button", { name: "Rejected · 1" }));
    const rows = within(await list()).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Hypokalaemia, cause unclear");
  });

  it("shows what changed when you open one", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    const view = screen.getByRole("button", {
      name: "View: Febrile seizure, simple",
    });
    await user.click(view);
    expect(view).toHaveAttribute("aria-expanded", "true");
    const before = screen.getByRole("region", { name: "What the system said" });
    expect(before.querySelector("del")).toHaveTextContent("Removed: simple");
    expect(screen.getByRole("region", { name: "Your reason" })).toBeVisible();
  });

  it("asks before withdrawing, with a safe default, then withdraws", async () => {
    const user = userEvent.setup();
    ui();
    await list();
    await user.click(
      screen.getByRole("button", { name: "Withdraw: Febrile seizure, simple" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw this correction?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Keep it" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("Correction withdrawn")).toBeVisible();
    expect(
      await screen.findByRole("button", { name: "Withdrawn · 1" }),
    ).toBeVisible();
  });

  it("explains when the correction was decided before you withdrew it", async () => {
    const user = userEvent.setup();
    vi.spyOn(holder.client, "withdrawCorrection").mockRejectedValueOnce(
      new ApiError(409, "already_decided"),
    );
    ui();
    await list();
    await user.click(
      screen.getByRole("button", { name: "Withdraw: Febrile seizure, simple" }),
    );
    await user.click(
      within(
        screen.getByRole("dialog", { name: "Withdraw this correction?" }),
      ).getByRole("button", { name: "Withdraw" }),
    );
    expect(
      await screen.findByText("This correction was already decided"),
    ).toBeVisible();
  });

  it("disables withdrawing while offline, and says why", async () => {
    ui();
    await list();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    const button = screen.getByRole("button", {
      name: "Withdraw: Febrile seizure, simple",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      "You're offline. Withdrawing needs a connection.",
    );
  });

  it("resubmits a rejected correction with your text to change", async () => {
    const user = userEvent.setup();
    const send = vi.spyOn(holder.client, "sendFeedback");
    ui();
    await list();
    await user.click(
      screen.getByRole("button", {
        name: "Resubmit: Hypokalaemia, cause unclear",
      }),
    );
    const dialog = screen.getByRole("dialog", { name: "Suggest it again" });
    const what = within(dialog).getByLabelText(/What should the diagnosis/);
    expect(what).toHaveValue("Hypokalaemia from vomiting");
    await user.clear(what);
    await user.type(what, "Hypokalaemia, cause unclear; monitor the heart");
    await user.click(
      within(dialog).getByRole("button", { name: "Submit correction" }),
    );
    expect(await screen.findByText("Sent for review again")).toBeVisible();
    expect(send).toHaveBeenCalledWith(
      {
        query_id: "q-c-vomiting",
        action: "correct",
        corrected_diagnosis: "Hypokalaemia, cause unclear; monitor the heart",
        reason: "Two days of vomiting explain it.",
      },
      { idempotencyKey: expect.any(String) },
    );
  });

  it("says when there's nothing yet", async () => {
    vi.spyOn(holder.client, "listMyCorrections").mockResolvedValue([]);
    ui();
    expect(await screen.findByText("No corrections yet")).toBeVisible();
  });

  it("offers to try again when the list can't load", async () => {
    const user = userEvent.setup();
    // A 4xx isn't retried, so the error shows at once.
    const load = vi
      .spyOn(holder.client, "listMyCorrections")
      .mockRejectedValueOnce(new ApiError(404, "not_found"));
    ui();
    expect(
      await screen.findByText("Couldn't load your corrections"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    expect(await list()).toBeVisible();
  });
});
```

Add to `components/shell/account-menu.test.tsx`, in the first test, the new
item in the expected list (it's second, after "Profile & security"):

```ts
expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
  "Profile & security",
  "My feedback & corrections",
  "Keyboard shortcuts",
  "Help & guide",
  "Sign out",
]);
```

and, in "moves with arrow keys and closes on Esc", `End` now lands on the
fifth item:

```ts
await user.keyboard("{End}");
expect(screen.getAllByRole("menuitem")[4]).toHaveFocus();
```

and add this test inside the `describe`:

```tsx
it("links to My feedback & corrections and closes the drawer", async () => {
  const user = userEvent.setup();
  renderWithAuth(<AccountMenu rail={false} />);
  await user.click(screen.getByRole("button", { name: /Account/ }));
  const item = screen.getByRole("menuitem", {
    name: "My feedback & corrections",
  });
  expect(item).toHaveAttribute("href", "/my-feedback");
  await user.click(item);
  expect(closeDrawer).toHaveBeenCalled();
  expect(screen.queryByRole("menu")).toBeNull();
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/corrections/my-corrections-view.test.tsx components/shell/account-menu.test.tsx`
Expected: FAIL: `./my-corrections-view` can't be resolved, and the menu
has no "My feedback & corrections".

- [ ] **Step 3: Let the correction form start from earlier text**

In `components/feedback/correction-form.tsx`, add the prop and use it as
the starting state:

```tsx
export function CorrectionForm({
  onSubmit,
  onCancel,
  onDirtyChange,
  busy,
  initial,
}: {
  onSubmit(v: { corrected_diagnosis: string; reason: string }): void;
  onCancel(): void;
  /** True while either field has text (so leaving can ask first). */
  onDirtyChange?(dirty: boolean): void;
  busy: boolean;
  /** Starting text, for resubmitting a rejected correction. */
  initial?: { corrected_diagnosis: string; reason: string };
}) {
  const [v, setV] = useState(
    () => initial ?? { corrected_diagnosis: "", reason: "" },
  );
```

(The rest of the component is unchanged.)

- [ ] **Step 4: Write the dialogs**

`components/corrections/withdraw-dialog.tsx`:

```tsx
"use client";
import type { DecisionError } from "@/lib/corrections";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";

/** "Keep it" comes first, so it gets the focus: the safe default (spec §7). */
export function WithdrawDialog({
  open,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onClose(): void;
  onConfirm(): void;
  busy: boolean;
  error: DecisionError | null;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Withdraw this correction?">
      <p className="text-sm text-ink-2">
        It leaves the review queue and nothing changes. You can suggest a new
        correction later.
      </p>
      {error && (
        <div className="mt-3">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          Withdraw
        </Button>
      </div>
    </Dialog>
  );
}
```

`components/corrections/resubmit-dialog.tsx`:

```tsx
"use client";
import type { CorrectionOut } from "@/lib/api/contract";
import { useFeedback } from "@/lib/queries";
import { CorrectionForm } from "../feedback/correction-form";
import { Banner } from "../ui/banner";
import { Dialog } from "../ui/dialog";
import { useToast } from "../ui/toast";

/** A rejected correction, changed and sent again as a new correction. */
export function ResubmitDialog({
  correction,
  onClose,
}: {
  correction: CorrectionOut | null;
  onClose(): void;
}) {
  const fb = useFeedback();
  const toast = useToast();
  const close = () => {
    fb.reset();
    onClose();
  };
  return (
    <Dialog open={correction !== null} onClose={close} title="Suggest it again">
      {correction && (
        <>
          <p className="text-sm text-ink-2">
            Change it with the reviewer&apos;s reason in mind. A second
            clinician reviews it again.
          </p>
          {fb.isError && (
            <div className="mt-3">
              <Banner tone="bad" title="Couldn't send your correction">
                Check your connection and try again.
              </Banner>
            </div>
          )}
          <CorrectionForm
            key={correction.id}
            initial={{
              corrected_diagnosis: correction.corrected_diagnosis,
              reason: correction.reason,
            }}
            busy={fb.isPending}
            onCancel={close}
            onSubmit={(v) =>
              fb.mutate(
                { query_id: correction.query_id, action: "correct", ...v },
                {
                  onSuccess: (r) => {
                    close();
                    toast.show(
                      r.status === "queued"
                        ? {
                            title: "Saved on this device",
                            body: "It will be sent when you're back online.",
                            tone: "info",
                          }
                        : {
                            title: "Sent for review again",
                            body: "A second clinician will review it.",
                            tone: "ok",
                          },
                    );
                  },
                },
              )
            }
          />
        </>
      )}
    </Dialog>
  );
}
```

- [ ] **Step 5: Write the page**

`components/corrections/my-corrections-view.tsx`:

```tsx
"use client";
import { useId, useState } from "react";
import type { CorrectionOut, CorrectionStatus } from "@/lib/api/contract";
import {
  useMyCorrections,
  useWithdrawCorrection,
} from "@/lib/correction-queries";
import {
  correctionTitle,
  decisionError,
  isOverdue,
  rejectionText,
  statusLine,
  type DecisionError,
} from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { useNetwork } from "@/lib/network";
import { CorrectionCompare } from "../review/correction-compare";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { OverdueChip, StatusChip } from "./chips";
import { ResubmitDialog } from "./resubmit-dialog";
import { WithdrawDialog } from "./withdraw-dialog";

type Filter = "all" | CorrectionStatus;

/** Your corrections and what the reviewers decided (states-and-export 7). */
export function MyCorrectionsView() {
  const q = useMyCorrections();
  const { online } = useNetwork();
  const now = useNow(60_000);
  const toast = useToast();
  const withdraw = useWithdrawCorrection();
  const offlineId = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [withdrawFor, setWithdrawFor] = useState<CorrectionOut | null>(null);
  const [withdrawError, setWithdrawError] = useState<DecisionError | null>(
    null,
  );
  const [resubmitFor, setResubmitFor] = useState<CorrectionOut | null>(null);

  const list = q.data ?? [];
  const count = (s: CorrectionStatus) =>
    list.filter((c) => c.status === s).length;
  const filters: [Filter, string][] = [
    ["all", `All · ${list.length}`],
    ["pending_review", `Waiting · ${count("pending_review")}`],
    ["approved", `Approved · ${count("approved")}`],
    ["rejected", `Rejected · ${count("rejected")}`],
  ];
  if (count("withdrawn"))
    filters.push(["withdrawn", `Withdrawn · ${count("withdrawn")}`]);
  const shown =
    filter === "all" ? list : list.filter((c) => c.status === filter);

  function confirmWithdraw() {
    const target = withdrawFor;
    if (!target) return;
    withdraw.mutate(
      { id: target.id },
      {
        onSuccess: () => {
          setWithdrawFor(null);
          toast.show({
            title: "Correction withdrawn",
            body: `${correctionTitle(target)}. It has left the review queue.`,
            tone: "info",
          });
        },
        onError: (e) => {
          const err = decisionError(e, "withdraw");
          if (!err.gone) return setWithdrawError(err);
          setWithdrawFor(null);
          toast.show({ title: err.title, body: err.body, ms: 8000 });
        },
      },
    );
  }

  return (
    <>
      <TopBar
        title="My feedback & corrections"
        sub="Your account"
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[760px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Your account
          </p>
          <h2 className="font-display text-[40px] font-black leading-none">
            My feedback &amp; corrections
          </h2>
          <p className="mt-2 text-[13.5px] text-ink-2">
            Corrections you suggested, and what the reviewers decided.
          </p>
          {q.isPending ? (
            <div aria-busy="true" className="mt-5 flex flex-col gap-3">
              <span className="sr-only">Loading your corrections</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !q.data ? (
            <div className="mt-5">
              <Banner tone="bad" title="Couldn't load your corrections">
                Check your connection and try again.
              </Banner>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : list.length === 0 ? (
            <section className="card-v3 mt-5 px-[22px] py-6 text-[14px] text-ink-2">
              <h3 className="text-base font-semibold text-ink">
                No corrections yet
              </h3>
              <p className="mt-1">
                When you suggest a correction on a result, you can follow it
                here: waiting, approved or rejected, with the reviewer&apos;s
                reason.
              </p>
            </section>
          ) : (
            <>
              <div
                role="group"
                aria-label="Show"
                className="mb-4 mt-4 flex flex-wrap gap-1.5"
              >
                {filters.map(([f, label]) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "min-h-11 rounded-full px-3 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-8",
                      filter === f
                        ? "bg-ink text-white"
                        : "bg-lilac text-bloom",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {!online && (
                <p id={offlineId} className="mb-3 text-[13px] text-ink-3">
                  You&apos;re offline. Withdrawing needs a connection.
                </p>
              )}
              <ul aria-label="Your corrections" className="card-v3 px-5 py-1.5">
                {shown.map((c) => {
                  const title = correctionTitle(c);
                  const reason = rejectionText(c.rejection);
                  const expanded = openId === c.id;
                  const panelId = `${offlineId}-${c.id}`;
                  return (
                    <li
                      key={c.id}
                      className="border-t border-line py-3.5 first:border-0"
                    >
                      <div className="flex flex-wrap items-start gap-3.5">
                        <StatusChip status={c.status} />
                        <div className="min-w-0 flex-1">
                          <b className="block [overflow-wrap:anywhere]">
                            {title}
                          </b>
                          <p className="text-[13px] text-ink-3">
                            {statusLine(c, now)}
                          </p>
                          {isOverdue(c, now) && (
                            <span className="mt-1 inline-block">
                              <OverdueChip />
                            </span>
                          )}
                          {reason && (
                            <p className="mt-1.5 rounded-xl bg-bad-wash px-3 py-2 text-[13px] text-bad-deep [overflow-wrap:anywhere]">
                              <span className="font-semibold">
                                Reviewer&apos;s reason:{" "}
                              </span>
                              “{reason}”
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            onClick={() => setOpenId(expanded ? null : c.id)}
                          >
                            {expanded ? "Hide" : "View"}
                            <span className="sr-only">: {title}</span>
                          </Button>
                          {c.status === "pending_review" && (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={!online}
                              aria-describedby={online ? undefined : offlineId}
                              onClick={() => {
                                setWithdrawError(null);
                                setWithdrawFor(c);
                              }}
                            >
                              Withdraw<span className="sr-only">: {title}</span>
                            </Button>
                          )}
                          {c.status === "rejected" && (
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => setResubmitFor(c)}
                            >
                              Resubmit<span className="sr-only">: {title}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div id={panelId} className="mt-3.5">
                          <CorrectionCompare c={c} mine />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      <WithdrawDialog
        open={withdrawFor !== null}
        onClose={() => setWithdrawFor(null)}
        onConfirm={confirmWithdraw}
        busy={withdraw.isPending}
        error={withdrawError}
      />
      <ResubmitDialog
        correction={resubmitFor}
        onClose={() => setResubmitFor(null)}
      />
    </>
  );
}
```

`app/(clinical)/my-feedback/page.tsx`:

```tsx
import type { Metadata } from "next";
import { MyCorrectionsView } from "@/components/corrections/my-corrections-view";

export const metadata: Metadata = {
  title: "My feedback & corrections · MHAI",
};

export default function MyFeedbackPage() {
  return <MyCorrectionsView />;
}
```

- [ ] **Step 6: Add the account menu item**

In `components/shell/account-menu.tsx`, add `PenLine` to the
`lucide-react` import and insert this item right after the "Profile &
security" link:

```tsx
<Link
  role="menuitem"
  href="/my-feedback"
  className={ITEM}
  onClick={() => {
    close(false);
    closeDrawer();
  }}
>
  <PenLine aria-hidden className="size-4" />
  My feedback &amp; corrections
</Link>
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- My feedback & corrections (account menu): your corrections as waiting,
  approved or rejected with the reviewer's reason; withdraw a waiting one,
  or change a rejected one and send it again.
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run components/corrections components/shell components/feedback`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/corrections components/feedback/correction-form.tsx components/shell/account-menu.tsx components/shell/account-menu.test.tsx "app/(clinical)/my-feedback" CHANGELOG.md
git commit -m "Add My feedback & corrections, with withdraw and resubmit"
```

---

### Task 8: The reject dialog

**Files:**

- Create: `lib/hooks/use-media.ts`, `components/review/reject-dialog.tsx`,
  `components/review/reject-dialog.test.tsx`
- Test: `components/review/reject-dialog.test.tsx`

**Interfaces:**

- Consumes: `REJECT_REASONS`, `NOTE_MAX`, `DecisionError` (Task 3);
  `RejectIn` (Task 1); `Dialog`, `Sheet`, `Banner`, `Button`.
- Produces:
  - `useIsDesktop(): boolean` (`min-width: 768px`; true on the server and
    where `matchMedia` is missing);
  - `RejectDialog({ open, onClose, submitter, gone, busy, error, onSubmit }: { open: boolean; onClose(): void; submitter: string; gone: boolean; busy: boolean; error: DecisionError | null; onSubmit(r: RejectIn): void })`.
    A `Dialog` titled "Why are you rejecting this?" from `md`; a bottom
    `Sheet` named "Why reject this?" below it (mobile F).

**Behaviour (review-queue.html 2, mobile F):**

- The reason chips are a radio group (legend "Reason", required): "Not
  supported by guidelines", "Partly right, needs rewording", "Unsafe", "Out
  of scope". The chosen chip also shows a check, so it isn't colour alone.
- "Note (optional)", at most 500 characters, with a counter.
- "Reject with reason" without a chip shows "Choose a reason." (on submit,
  never while choosing) and moves focus to the first chip. The note is
  trimmed and left out when empty.
- "{submitter} will see your reason." beside the buttons.
- `gone` (decided elsewhere, Review Focus 1): a warning banner, sending is
  disabled, and the typed note stays. `error` shows a banner (unless
  `gone`); the form stays as typed.
- Esc and "Cancel" call `onClose`. The form state resets each time it
  opens.

- [ ] **Step 1: Write the failing tests**

`components/review/reject-dialog.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RejectDialog } from "./reject-dialog";

const base = {
  open: true,
  onClose: vi.fn(),
  submitter: "Dr. Okafor",
  gone: false,
  busy: false,
  error: null,
  onSubmit: vi.fn(),
};
afterEach(() => {
  vi.unstubAllGlobals();
  base.onClose.mockReset();
  base.onSubmit.mockReset();
});

describe("RejectDialog", () => {
  it("needs a reason, and says so only when you try to send", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    expect(within(dialog).queryByText("Choose a reason.")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(within(dialog).getByText("✕ Choose a reason.")).toBeVisible();
    expect(within(dialog).getAllByRole("radio")[0]).toHaveFocus();
    expect(base.onSubmit).not.toHaveBeenCalled();
  });

  it("sends the reason and the trimmed note", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    await user.click(screen.getByRole("radio", { name: "Unsafe" }));
    await user.type(screen.getByLabelText("Note (optional)"), "  Too fast.  ");
    await user.click(
      screen.getByRole("button", { name: "Reject with reason" }),
    );
    expect(base.onSubmit).toHaveBeenCalledWith({
      reason_code: "unsafe",
      note: "Too fast.",
    });
  });

  it("leaves the note out when it's empty", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    await user.click(
      screen.getByRole("radio", { name: "Partly right, needs rewording" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Reject with reason" }),
    );
    expect(base.onSubmit).toHaveBeenCalledWith({
      reason_code: "needs_rewording",
    });
  });

  it("says the suggester will see it, and caps the note", () => {
    render(<RejectDialog {...base} />);
    expect(screen.getByText("Dr. Okafor will see your reason.")).toBeVisible();
    expect(screen.getByLabelText("Note (optional)")).toHaveAttribute(
      "maxlength",
      "500",
    );
    expect(screen.getByText("0 / 500")).toBeVisible();
  });

  it("closes on Esc and on Cancel", async () => {
    const user = userEvent.setup();
    render(<RejectDialog {...base} />);
    await user.keyboard("{Escape}");
    expect(base.onClose).toHaveBeenCalled();
    base.onClose.mockClear();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(base.onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open with the note when the correction is decided elsewhere (Review Focus 1)", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RejectDialog {...base} />);
    await user.click(screen.getByRole("radio", { name: "Unsafe" }));
    await user.type(screen.getByLabelText("Note (optional)"), "Keep platelets");
    rerender(<RejectDialog {...base} gone />);
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue(
      "Keep platelets",
    );
    const send = screen.getByRole("button", { name: "Reject with reason" });
    expect(send).toBeDisabled();
  });

  it("shows why sending failed and keeps what you typed", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<RejectDialog {...base} />);
    await user.type(screen.getByLabelText("Note (optional)"), "Kept");
    rerender(
      <RejectDialog
        {...base}
        error={{
          title: "Your rejection wasn't sent",
          body: "You're offline or the connection dropped.",
          gone: false,
          own: false,
        }}
      />,
    );
    expect(screen.getByText("Your rejection wasn't sent")).toBeVisible();
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("Kept");
  });

  it("is a bottom sheet on a phone", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      })),
    );
    render(<RejectDialog {...base} />);
    const sheet = screen.getByRole("dialog", { name: "Why reject this?" });
    expect(sheet).toHaveAttribute("aria-modal", "true");
    expect(
      within(sheet).getByRole("button", { name: "Reject with reason" }),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/review/reject-dialog.test.tsx`
Expected: FAIL: `./reject-dialog` can't be resolved.

- [ ] **Step 3: Write the media hook**

`lib/hooks/use-media.ts`:

```ts
"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";
const supported = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribe(fn: () => void) {
  if (!supported()) return () => {};
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}

/** True from the `md` breakpoint; the server and old browsers count as desktop. */
export const useIsDesktop = () =>
  useSyncExternalStore(
    subscribe,
    () => !supported() || window.matchMedia(QUERY).matches,
    () => true,
  );
```

- [ ] **Step 4: Write the dialog**

`components/review/reject-dialog.tsx`:

```tsx
"use client";
import { Check } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { RejectIn, RejectReasonCode } from "@/lib/api/contract";
import {
  NOTE_MAX,
  REJECT_REASONS,
  type DecisionError,
} from "@/lib/corrections";
import { useIsDesktop } from "@/lib/hooks/use-media";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Sheet } from "../ui/sheet";

type Props = {
  open: boolean;
  onClose(): void;
  /** Who suggested the correction: they will read the reason. */
  submitter: string;
  /** Decided elsewhere while the dialog was open (Review Focus 1). */
  gone: boolean;
  busy: boolean;
  error: DecisionError | null;
  onSubmit(r: RejectIn): void;
};

/** Reject needs a reason (spec §5.4). A dialog on desktop, a sheet on phones. */
export function RejectDialog(props: Props) {
  const desktop = useIsDesktop();
  // Mounted only while open, so each opening starts empty.
  const form = props.open ? <RejectForm {...props} /> : null;
  return desktop ? (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Why are you rejecting this?"
    >
      {form}
    </Dialog>
  ) : (
    <Sheet open={props.open} onClose={props.onClose} title="Why reject this?">
      <h2 className="mb-3 font-display text-[28px] font-black leading-none">
        Why reject this?
      </h2>
      {form}
    </Sheet>
  );
}

function RejectForm({
  onClose,
  submitter,
  gone,
  busy,
  error,
  onSubmit,
}: Props) {
  const [code, setCode] = useState<RejectReasonCode | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (gone || busy) return;
        if (!code) {
          setMissing(true);
          first.current?.focus();
          return;
        }
        const n = note.trim();
        onSubmit(n ? { reason_code: code, note: n } : { reason_code: code });
      }}
    >
      {gone && (
        <Banner
          tone="warn"
          title="Another clinician has already decided this correction"
        >
          Nothing you write here will be sent. Close this and carry on with the
          next one.
        </Banner>
      )}
      <fieldset
        aria-describedby={missing ? `${id}-err` : undefined}
        className="mt-3"
      >
        <legend className="mb-2 text-[13px] font-semibold text-bad-deep">
          Reason <span aria-hidden>*</span>
          <span className="sr-only">(required)</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {REJECT_REASONS.map((r, i) => (
            <label key={r.code} className="cursor-pointer">
              <input
                ref={i === 0 ? first : undefined}
                type="radio"
                name={`${id}-reason`}
                value={r.code}
                checked={code === r.code}
                onChange={() => {
                  setCode(r.code);
                  setMissing(false);
                }}
                className="peer sr-only"
              />
              <span className="flex min-h-11 items-center gap-1.5 rounded-full border border-bad-line bg-white px-3 text-[12.5px] text-bad-deep peer-checked:border-bad peer-checked:bg-bad peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-mint-deep sm:min-h-9">
                {code === r.code && <Check aria-hidden className="size-3.5" />}
                {r.label}
              </span>
            </label>
          ))}
        </div>
        {missing && (
          <p id={`${id}-err`} className="mt-1.5 text-xs text-bad">
            ✕ Choose a reason.
          </p>
        )}
      </fieldset>
      <label
        htmlFor={`${id}-note`}
        className="mb-1.5 mt-3 block text-[12.5px] text-ink-2"
      >
        Note (optional)
      </label>
      <textarea
        id={`${id}-note`}
        rows={3}
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-sm outline-none [overflow-wrap:anywhere] focus:border-mint focus:ring-4 focus:ring-mint/15"
      />
      <p className="mt-1 text-right font-mono text-[11px] text-ink-3">
        {note.length} / {NOTE_MAX}
      </p>
      {error && !gone && (
        <div className="mt-2">
          <Banner tone="bad" title={error.title}>
            {error.body}
          </Banner>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="submit" variant="danger" disabled={busy || gone}>
          Reject with reason
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <span className="ml-auto text-xs text-ink-3">
          {submitter} will see your reason.
        </span>
      </div>
    </form>
  );
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/review/reject-dialog.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/hooks/use-media.ts components/review/reject-dialog.tsx components/review/reject-dialog.test.tsx
git commit -m "Add the reject dialog: a required reason and an optional note"
```

---

### Task 9: The 10-second undo

**Files:**

- Create: `lib/review/use-undoable-approval.ts`,
  `lib/review/use-undoable-approval.test.tsx`
- Test: `lib/review/use-undoable-approval.test.tsx`

**Interfaces:**

- Consumes: `getClient().approveCorrection` (Task 1); `ApiError`;
  `UNDO_WINDOW_MS` (Task 3); `refreshCorrections` (Task 5).
- Produces:
  - `interface PendingApproval { item: CorrectionOut; key: string; endsAt: number }`;
  - `useUndoableApproval(opts: { windowMs?: number; onSent(item: CorrectionOut): void; onFailed(item: CorrectionOut, e: unknown): void }): { pending: PendingApproval | null; start(item: CorrectionOut): void; undo(): CorrectionOut | null; flush(): void }`.

**Rules (ruling R1):**

- `start(item)` sends any approval already waiting, then opens a new window
  with a fresh `Idempotency-Key`.
- The window ending, `flush()`, unmounting, or `pagehide` sends the waiting
  approval once. Unmount and `pagehide` send with `keepalive: true`.
- `undo()` inside the window cancels it and returns the item; afterwards it
  returns `null` and does nothing.
- If the browser is offline when the approval is due, nothing is sent and
  `onFailed(item, ApiError(0, "network"))` runs (R8). A refusal from the API
  goes to `onFailed` too. Every send, whatever its outcome, refreshes the
  correction lists.
- The callbacks are read at call time, so an approval that lands after the
  page has gone still reaches the latest handlers (they show a toast; the
  toast provider sits above the page).

- [ ] **Step 1: Write the failing tests**

`lib/review/use-undoable-approval.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCorrection } from "@/tests/corrections";

const approve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ approveCorrection: approve }),
}));
import { ApiError } from "@/lib/api/errors";
import { UNDO_WINDOW_MS } from "@/lib/corrections";
import { useUndoableApproval } from "./use-undoable-approval";

const a = makeCorrection({ id: "a" });
const b = makeCorrection({ id: "b" });
const onSent = vi.fn();
const onFailed = vi.fn();
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);
const setup = () =>
  renderHook(() => useUndoableApproval({ onSent, onFailed }), { wrapper });
const sentIds = () => approve.mock.calls.map((c) => c[0]);
const opts = (i: number) =>
  approve.mock.calls[i]?.[1] as { idempotencyKey: string; keepalive: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  approve.mockReset();
  approve.mockResolvedValue(undefined);
  onSent.mockReset();
  onFailed.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useUndoableApproval (Review Focus 2)", () => {
  it("sends nothing during the window, then once, with one key", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    expect(result.current.pending?.item.id).toBe("a");
    expect(result.current.pending?.endsAt).toBe(Date.now() + UNDO_WINDOW_MS);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS - 1));
    expect(approve).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0)).toEqual({
      idempotencyKey: expect.any(String),
      keepalive: false,
    });
    expect(result.current.pending).toBeNull();
    expect(onSent).toHaveBeenCalledWith(a);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("undo inside the window sends nothing and gives the item back", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS / 2));
    let back: unknown;
    act(() => {
      back = result.current.undo();
    });
    expect(back).toBe(a);
    expect(result.current.pending).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 3));
    expect(approve).not.toHaveBeenCalled();
  });

  it("undo after the window has ended does nothing", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    let back: unknown = "unset";
    act(() => {
      back = result.current.undo();
    });
    expect(back).toBeNull();
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("approving the next one sends the first at once, each with its own key", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    act(() => result.current.start(b));
    expect(sentIds()).toEqual(["a"]);
    expect(result.current.pending?.item.id).toBe("b");
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(sentIds()).toEqual(["a", "b"]);
    expect(opts(0).idempotencyKey).not.toBe(opts(1).idempotencyKey);
  });

  it("flush sends at once (another decision started)", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    await act(async () => result.current.flush());
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0).keepalive).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("leaving the page in the app sends at once, with keepalive", async () => {
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    unmount();
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0).keepalive).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("a reload or closing the tab (pagehide) sends at once, with keepalive", async () => {
    const { result, unmount } = setup();
    act(() => result.current.start(a));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(sentIds()).toEqual(["a"]);
    expect(opts(0).keepalive).toBe(true);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("offline at the end: not sent, and handed back as a network failure (Review Focus 3)", async () => {
    const { result } = setup();
    act(() => result.current.start(a));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).not.toHaveBeenCalled();
    expect(onFailed).toHaveBeenCalledWith(a, expect.any(ApiError));
    expect((onFailed.mock.calls[0]?.[1] as ApiError).status).toBe(0);
    expect(result.current.pending).toBeNull();
  });

  it("hands a refusal back", async () => {
    approve.mockRejectedValueOnce(new ApiError(409, "already_decided"));
    const { result } = setup();
    act(() => result.current.start(a));
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(onFailed).toHaveBeenCalledWith(
      a,
      expect.objectContaining({ status: 409 }),
    );
    expect(onSent).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run lib/review/use-undoable-approval.test.tsx`
Expected: FAIL: `./use-undoable-approval` can't be resolved.

- [ ] **Step 3: Write the hook**

`lib/review/use-undoable-approval.ts`:

```ts
"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getClient } from "@/lib/api/client";
import type { CorrectionOut } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { refreshCorrections } from "@/lib/correction-queries";
import { UNDO_WINDOW_MS } from "@/lib/corrections";

export interface PendingApproval {
  item: CorrectionOut;
  /** One key per Approve press, so a repeat never approves twice. */
  key: string;
  endsAt: number;
}

type Live = {
  p: PendingApproval | null;
  timer: ReturnType<typeof setTimeout> | null;
};

/** Ends the live window (if any) and returns what was waiting. */
function take(live: { current: Live }): PendingApproval | null {
  const { p, timer } = live.current;
  if (timer) clearTimeout(timer);
  live.current = { p: null, timer: null };
  return p;
}

/**
 * Approve with a grace period (ruling R1). Nothing is sent until the window
 * ends, another decision starts, the page unmounts or the tab is hidden for
 * good (pagehide). Leaving confirms; only Undo cancels.
 */
export function useUndoableApproval({
  windowMs = UNDO_WINDOW_MS,
  onSent,
  onFailed,
}: {
  windowMs?: number;
  onSent(item: CorrectionOut): void;
  onFailed(item: CorrectionOut, e: unknown): void;
}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingApproval | null>(null);
  // The live window, read by timers and listeners; written only in callbacks.
  const live = useRef<Live>({ p: null, timer: null });
  const handlers = useRef({ onSent, onFailed });
  useEffect(() => {
    handlers.current = { onSent, onFailed };
  });

  const send = useCallback(
    (p: PendingApproval, keepalive: boolean) => {
      // Decisions are never queued offline (R8): not sent, nothing changed.
      if (!navigator.onLine) {
        handlers.current.onFailed(p.item, new ApiError(0, "network"));
        return;
      }
      getClient()
        .approveCorrection(p.item.id, { idempotencyKey: p.key, keepalive })
        .then(
          () => handlers.current.onSent(p.item),
          (e: unknown) => handlers.current.onFailed(p.item, e),
        )
        .finally(() => void refreshCorrections(qc));
    },
    [qc],
  );

  const flushWith = useCallback(
    (keepalive: boolean) => {
      const p = take(live);
      if (!p) return;
      setPending(null);
      send(p, keepalive);
    },
    [send],
  );

  const flush = useCallback(() => flushWith(false), [flushWith]);

  const start = useCallback(
    (item: CorrectionOut) => {
      flushWith(false);
      const p: PendingApproval = {
        item,
        key: crypto.randomUUID(),
        endsAt: Date.now() + windowMs,
      };
      live.current = { p, timer: setTimeout(() => flushWith(false), windowMs) };
      setPending(p);
    },
    [flushWith, windowMs],
  );

  const undo = useCallback((): CorrectionOut | null => {
    const p = take(live);
    if (!p) return null;
    setPending(null);
    return p.item;
  }, []);

  // Leaving the page confirms: in-app (unmount) or the tab going away.
  useEffect(() => {
    const leave = () => flushWith(true);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [flushWith]);

  return { pending, start, undo, flush };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run lib/review/use-undoable-approval.test.tsx`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/review
git commit -m "Send an approval after a 10-second undo, or at once on leaving"
```

---

### Task 10: The review screen's parts

**Files:**

- Create: `components/review/queue-list.tsx`,
  `components/review/review-detail.tsx`,
  `components/review/undo-notice.tsx`,
  `components/review/all-caught-up.tsx`,
  `components/review/review-parts.test.tsx`
- Modify: `components/ui/button.tsx` (an `approve` variant)
- Test: `components/review/review-parts.test.tsx`

**Interfaces:**

- Consumes: `QueueItem`, `ageLabel`, `correctionTitle`, `isOverdue`,
  `parseTime` (Task 3); `StatusChip`, `OriginalChip`, `OverdueChip`,
  `CorrectionCompare`, `ConsultationDialog` (Task 4); `useMyReviews`
  (Task 5); `PendingApproval` (Task 9); `Avatar`
  (`components/shell/account-menu.tsx`); `useNow`; `Banner`, `Button`,
  `Chip`.
- Produces:
  - `QueueList({ items, selectedId, now, onSelect }: { items: QueueItem[]; selectedId: string | null; now: number; onSelect(i: QueueItem): void })`:
    a list named "Waiting corrections" of buttons, the selected one with
    `aria-current="true"`;
  - `ReviewDetail(props: { item: QueueItem; now: number; position: { index: number; total: number } | null; gone: boolean; online: boolean; busy: boolean; onApprove(): void; onReject(): void; onSkip(): void; onWithdraw(): void; onBack(): void; onNext(): void; approveRef?: Ref<HTMLButtonElement> })`;
  - `UndoNotice({ pending, onUndo, undoRef }: { pending: PendingApproval; onUndo(): void; undoRef?: Ref<HTMLButtonElement> })`;
  - `RecentDecisions({ items, now }: { items: CorrectionOut[]; now: number })`
    (a list named "Your recent decisions") and `AllCaughtUp({ now }: { now: number })`;
  - `Button` variant `approve`.

**Behaviour (review-queue.html 1, 3, 4, 5; mobile D, E):**

- **Queue row:** title and age (red and bold when overdue), the correction
  in two lines at most, then the original label, the consultation's
  specialty, "· {name}" or "Your correction" with a lock, and "Over 4 h".
- **Detail:**
  - on phones a "Back to the queue" button and "1 of 3 · 42 min ago";
  - eyebrow "Correction · submitted 42 min ago", the title as `h2`, and
    "Original: {label}";
  - the who row ("Dr. Chidi Okafor suggested this · Paediatrics · Havana
    Hospital", or "You suggested this") with "Open consultation";
  - banners when `gone` ("Another clinician has already decided this
    correction" with "Next correction") or offline ("You're offline" ·
    "Decisions need a connection. Approve, Reject and Withdraw come back
    when you're online.");
  - the compare view; for your own, the lock panel "You can't review your
    own correction. Another clinician needs to approve it." plus "It's been
    waiting N hours." once overdue;
  - the decision bar (a group named "Decision"): "Approve correction"
    (`aria-keyshortcuts="A"`), "Reject" (`R`), then "Skip" (others', from
    `md`) or "Withdraw my correction" (yours), and "You are the second
    reviewer · A / R to decide" from `lg`. Disabled buttons are described
    by the text that says why. Sticky at the bottom on desktop; docked to
    the screen bottom on phones (Reject left, Approve right).
- **Undo notice** (`role="status"`): "Correction approved", "{title}.
  {name} will be told, and it goes to clinical sign-off before anything
  changes.", and "Undo (N s)" whose accessible name stays "Undo approval"
  so the countdown isn't read out every second.
- **All caught up:** the check, "All caught up", "No corrections are
  waiting for you. New ones appear here, and the count shows in the
  sidebar.", then up to five recent decisions.

- [ ] **Step 1: Write the failing tests**

`components/review/review-parts.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { T0, makeCorrection } from "@/tests/corrections";

const listReviewed = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/client", () => ({
  getClient: () => ({ listMyReviews: listReviewed }),
}));
import { AllCaughtUp, RecentDecisions } from "./all-caught-up";
import { QueueList } from "./queue-list";
import { ReviewDetail } from "./review-detail";
import { UndoNotice } from "./undo-notice";

const H = 3_600_000;
const okafor = makeCorrection({ id: "o" });
const late = makeCorrection({
  id: "late",
  submitted_at: new Date(T0 - 5 * H).toISOString(),
});
late.original.diagnosis = "Febrile seizure, simple";

function detail(over: Partial<ComponentProps<typeof ReviewDetail>> = {}) {
  const props: ComponentProps<typeof ReviewDetail> = {
    item: { c: okafor, mine: false },
    now: T0,
    position: { index: 1, total: 3 },
    gone: false,
    online: true,
    busy: false,
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onSkip: vi.fn(),
    onWithdraw: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...over,
  };
  render(<ReviewDetail {...props} />);
  return props;
}
afterEach(() => {
  vi.useRealTimers();
  listReviewed.mockReset();
});

describe("QueueList", () => {
  it("shows the age, label, specialty and who, and flags over 4 hours", async () => {
    const onSelect = vi.fn();
    render(
      <QueueList
        items={[
          { c: late, mine: true },
          { c: okafor, mine: false },
        ]}
        selectedId="o"
        now={T0}
        onSelect={onSelect}
      />,
    );
    const [first, second] = within(
      screen.getByRole("list", { name: "Waiting corrections" }),
    ).getAllByRole("button");
    expect(first).toHaveTextContent("Febrile seizure, simple");
    expect(first).toHaveTextContent("5 h");
    expect(first).toHaveTextContent("Over 4 h waiting");
    expect(first).toHaveTextContent("Your correction");
    expect(first).not.toHaveAttribute("aria-current");
    expect(second).toHaveTextContent("42 min");
    expect(second).toHaveTextContent("Use with caution");
    expect(second).toHaveTextContent("Infectious disease");
    expect(second).toHaveTextContent("· Dr. Okafor");
    expect(second).not.toHaveTextContent("Over 4 h");
    expect(second).toHaveAttribute("aria-current", "true");
    await userEvent.click(first!);
    expect(onSelect).toHaveBeenCalledWith({ c: late, mine: true });
  });

  it("clamps a long summary in the queue (Review Focus 5)", () => {
    const long = makeCorrection({ corrected_diagnosis: "z".repeat(3000) });
    render(
      <QueueList
        items={[{ c: long, mine: false }]}
        selectedId={null}
        now={T0}
        onSelect={() => {}}
      />,
    );
    const summary = screen.getByText("z".repeat(3000));
    expect(summary.className).toContain("line-clamp-2");
    expect(summary.className).toContain("[overflow-wrap:anywhere]");
  });
});

describe("ReviewDetail", () => {
  it("says who suggested it and offers Approve, Reject and Skip with shortcuts", async () => {
    const p = detail();
    expect(
      screen.getByRole("heading", { name: "Dengue fever, likely" }),
    ).toBeVisible();
    expect(screen.getByText("Correction · submitted 42 min ago")).toBeVisible();
    expect(screen.getByText("Original: Use with caution")).toBeVisible();
    expect(screen.getByText("Dr. Chidi Okafor")).toBeVisible();
    expect(
      screen.getByText(/suggested this · Paediatrics · Havana Hospital/),
    ).toBeVisible();
    const approve = screen.getByRole("button", { name: "Approve correction" });
    const reject = screen.getByRole("button", { name: "Reject" });
    expect(approve).toHaveAttribute("aria-keyshortcuts", "A");
    expect(reject).toHaveAttribute("aria-keyshortcuts", "R");
    await userEvent.click(approve);
    await userEvent.click(reject);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(p.onApprove).toHaveBeenCalledTimes(1);
    expect(p.onReject).toHaveBeenCalledTimes(1);
    expect(p.onSkip).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/You are the second reviewer/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Decision" })).toContainElement(
      approve,
    );
  });

  it("disables deciding your own correction, says why, and offers withdraw", async () => {
    const p = detail({ item: { c: late, mine: true } });
    const approve = screen.getByRole("button", { name: "Approve correction" });
    expect(approve).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(
      /You can't review your own correction/,
    );
    expect(screen.getByText(/It's been waiting 5 hours/)).toBeVisible();
    expect(screen.getByText("You suggested this")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    expect(p.onWithdraw).toHaveBeenCalled();
  });

  it("disables decisions offline and says why (Review Focus 3)", () => {
    detail({ online: false });
    expect(screen.getByText("You're offline")).toBeVisible();
    const approve = screen.getByRole("button", { name: "Approve correction" });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription(/Decisions need a connection/);
  });

  it("keeps showing a correction decided elsewhere, with a way on (Review Focus 1)", async () => {
    const p = detail({ gone: true });
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Dengue fever, likely" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve correction" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Next correction" }),
    );
    expect(p.onNext).toHaveBeenCalled();
  });

  it("goes back on a phone and opens the consultation", async () => {
    const p = detail();
    expect(screen.getByText("1 of 3 · 42 min ago")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Back to the queue" }),
    );
    expect(p.onBack).toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Open consultation" }),
    );
    expect(
      screen.getByRole("dialog", { name: "The consultation" }),
    ).toHaveTextContent("Fever 3 days and rash, dengue area. Admit?");
  });
});

describe("UndoNotice", () => {
  it("counts down in text, keeps a steady name, and undoes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onUndo = vi.fn();
    render(
      <UndoNotice
        pending={{ item: okafor, key: "k", endsAt: Date.now() + 10_000 }}
        onUndo={onUndo}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Correction approved");
    expect(status).toHaveTextContent(
      "Dengue fever, likely. Dr. Okafor will be told",
    );
    const undo = screen.getByRole("button", { name: "Undo approval" });
    expect(undo).toHaveTextContent("Undo (10 s)");
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(undo).toHaveTextContent("Undo (7 s)");
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(undo);
    expect(onUndo).toHaveBeenCalled();
  });
});

describe("All caught up", () => {
  it("rewards an empty queue with your recent decisions", async () => {
    listReviewed.mockResolvedValue([
      {
        ...okafor,
        status: "approved",
        decided_at: new Date(T0 - 60_000).toISOString(),
      },
      {
        ...late,
        status: "rejected",
        decided_at: new Date(T0 - 2 * H).toISOString(),
      },
    ]);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AllCaughtUp now={T0} />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "All caught up" }),
    ).toBeVisible();
    const list = await screen.findByRole("list", {
      name: "Your recent decisions",
    });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Approved");
    expect(rows[0]).toHaveTextContent("Dengue fever, likely");
    expect(rows[0]).toHaveTextContent("1 min ago");
    expect(rows[1]).toHaveTextContent("Rejected");
    expect(rows[1]).toHaveTextContent("Febrile seizure, simple");
  });

  it("says so when you haven't decided any yet", () => {
    render(<RecentDecisions items={[]} now={T0} />);
    expect(
      screen.getByText("You haven't decided any corrections yet."),
    ).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/review/review-parts.test.tsx`
Expected: FAIL: the four component modules can't be resolved.

- [ ] **Step 3: Add the approve button style**

In `components/ui/button.tsx`, add to `VARIANT`:

```ts
  approve:
    "bg-ok text-white shadow-[0_14px_28px_-14px_var(--color-ok)]",
```

- [ ] **Step 4: Write the queue list**

`components/review/queue-list.tsx`:

```tsx
"use client";
import { Lock } from "lucide-react";
import {
  ageLabel,
  correctionTitle,
  isOverdue,
  parseTime,
  type QueueItem,
} from "@/lib/corrections";
import { OriginalChip, OverdueChip } from "../corrections/chips";
import { Chip } from "../ui/chip";
import { cn } from "../ui/cn";

/** The left column (desktop) or the card list (phones) of the review queue. */
export function QueueList({
  items,
  selectedId,
  now,
  onSelect,
}: {
  items: QueueItem[];
  selectedId: string | null;
  now: number;
  onSelect(i: QueueItem): void;
}) {
  return (
    <ul aria-label="Waiting corrections">
      {items.map((i) => {
        const { c } = i;
        const t = parseTime(c.submitted_at);
        const overdue = isOverdue(c, now);
        const on = c.id === selectedId;
        return (
          <li key={c.id}>
            <button
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => onSelect(i)}
              className={cn(
                "block w-full border-t border-line px-4 py-3 text-left text-[13px] hover:bg-white focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
                on && "bg-white shadow-[inset_3px_0_0_var(--color-mint)]",
              )}
            >
              <span className="flex justify-between gap-2 text-[14px] font-semibold">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {correctionTitle(c)}
                </span>
                {t !== null && (
                  <small
                    className={cn(
                      "whitespace-nowrap text-[11.5px] font-normal text-ink-3",
                      overdue && "font-bold text-bad",
                    )}
                  >
                    {ageLabel(t, now)}
                  </small>
                )}
              </span>
              <span className="mb-1.5 mt-1 line-clamp-2 block leading-snug text-ink-2 [overflow-wrap:anywhere]">
                {c.corrected_diagnosis}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-ink-3">
                <OriginalChip original={c.original} />
                {c.consultation.specialty && (
                  <Chip>{c.consultation.specialty}</Chip>
                )}
                {i.mine ? (
                  <span className="flex items-center gap-1 font-semibold text-bloom">
                    <Lock aria-hidden className="size-3" />
                    Your correction
                  </span>
                ) : (
                  <span>· {c.submitted_by.display_name}</span>
                )}
                {overdue && <OverdueChip />}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 5: Write the detail**

`components/review/review-detail.tsx`:

```tsx
"use client";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { useId, useState, type Ref } from "react";
import {
  ageLabel,
  correctionTitle,
  isOverdue,
  parseTime,
  type QueueItem,
} from "@/lib/corrections";
import { OriginalChip } from "../corrections/chips";
import { Avatar } from "../shell/account-menu";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConsultationDialog } from "./consultation-dialog";
import { CorrectionCompare } from "./correction-compare";

/** The right column (desktop) or the compare screen (phones). */
export function ReviewDetail({
  item,
  now,
  position,
  gone,
  online,
  busy,
  onApprove,
  onReject,
  onSkip,
  onWithdraw,
  onBack,
  onNext,
  approveRef,
}: {
  item: QueueItem;
  now: number;
  /** "1 of 3" on phones; null when the item has left the list. */
  position: { index: number; total: number } | null;
  /** Decided elsewhere while you were looking (Review Focus 1). */
  gone: boolean;
  online: boolean;
  busy: boolean;
  onApprove(): void;
  onReject(): void;
  onSkip(): void;
  onWithdraw(): void;
  onBack(): void;
  onNext(): void;
  approveRef?: Ref<HTMLButtonElement>;
}) {
  const { c, mine } = item;
  const [consultOpen, setConsultOpen] = useState(false);
  const id = useId();
  const submitted = parseTime(c.submitted_at);
  const age = submitted === null ? null : ageLabel(submitted, now);
  const hours =
    submitted === null ? null : Math.floor((now - submitted) / 3_600_000);
  const person = c.submitted_by;
  const decidable = !mine && !gone && online && !busy;
  // Disabled buttons are described by the text that says why.
  const why = gone
    ? `${id}-gone`
    : mine
      ? `${id}-own`
      : !online
        ? `${id}-offline`
        : undefined;

  return (
    <article aria-labelledby={`${id}-title`} className="mx-auto max-w-[860px]">
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          Back to the queue
        </Button>
        {position && (
          <span className="ml-auto font-mono text-[11.5px] text-ink-3">
            {position.index} of {position.total}
            {age && ` · ${age} ago`}
          </span>
        )}
      </div>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Correction{age && ` · submitted ${age} ago`}
          </p>
          <h2
            id={`${id}-title`}
            className="mt-0.5 font-display text-[32px] font-black leading-none [overflow-wrap:anywhere] md:text-[36px]"
          >
            {correctionTitle(c)}
          </h2>
        </div>
        <OriginalChip original={c.original} prefix="Original: " />
      </header>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink-2">
        <Avatar
          name={person.display_name}
          className="size-[30px] text-[11px]"
        />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {mine ? (
            <b>You suggested this</b>
          ) : (
            <>
              <b>{person.full_name ?? person.display_name}</b> suggested this
            </>
          )}
          {[person.specialty, person.hospital]
            .filter(Boolean)
            .map((s) => ` · ${s}`)
            .join("")}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setConsultOpen(true)}>
          Open consultation
          <ExternalLink aria-hidden className="size-3.5" />
        </Button>
      </div>
      {gone && (
        <div id={`${id}-gone`} className="mb-3.5">
          <Banner
            tone="warn"
            title="Another clinician has already decided this correction"
          >
            Nothing you do here will be sent.{" "}
            <button
              type="button"
              onClick={onNext}
              className="min-h-11 font-semibold underline sm:min-h-0"
            >
              Next correction
            </button>
          </Banner>
        </div>
      )}
      {!online && !gone && (
        <div id={`${id}-offline`} className="mb-3.5">
          <Banner tone="info" title="You're offline">
            Decisions need a connection. Approve, Reject and Withdraw come back
            when you&apos;re online.
          </Banner>
        </div>
      )}
      <CorrectionCompare c={c} mine={mine} />
      {mine && (
        <div
          id={`${id}-own`}
          className="mt-4 flex items-center gap-3 rounded-2xl bg-lilac px-4 py-3.5 text-[13.5px] text-bloom"
        >
          <Lock aria-hidden className="size-5 shrink-0" />
          <p>
            You can&apos;t review your own correction. Another clinician needs
            to approve it.
            {isOverdue(c, now) &&
              hours !== null &&
              ` It's been waiting ${hours} hours.`}
          </p>
        </div>
      )}
      <div
        role="group"
        aria-label="Decision"
        className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap items-center gap-2.5 border-t border-line bg-bg/95 px-4 py-3.5 max-md:fixed max-md:inset-x-0 max-md:mx-0 max-md:pb-[max(14px,env(safe-area-inset-bottom))] md:-mx-[26px] md:px-[26px]"
      >
        <Button
          ref={approveRef}
          variant="approve"
          aria-keyshortcuts="A"
          aria-describedby={why}
          disabled={!decidable}
          onClick={onApprove}
          className="max-md:order-2 max-md:flex-1"
        >
          <Check aria-hidden className="size-4" />
          Approve correction
        </Button>
        <Button
          variant="danger"
          aria-keyshortcuts="R"
          aria-describedby={why}
          disabled={!decidable}
          onClick={onReject}
          className="max-md:order-1 max-md:flex-1"
        >
          <X aria-hidden className="size-4" />
          Reject
        </Button>
        {mine ? (
          <Button
            variant="ghost"
            disabled={!online || gone || busy}
            onClick={onWithdraw}
            className="max-md:order-3 max-md:w-full"
          >
            Withdraw my correction
          </Button>
        ) : (
          <Button variant="ghost" onClick={onSkip} className="max-md:hidden">
            Skip
          </Button>
        )}
        {!mine && (
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-ink-3 lg:flex">
            <ShieldCheck aria-hidden className="size-3.5" />
            You are the second reviewer · A / R to decide
          </span>
        )}
      </div>
      <ConsultationDialog
        c={c}
        mine={mine}
        open={consultOpen}
        onClose={() => setConsultOpen(false)}
      />
    </article>
  );
}
```

- [ ] **Step 6: Write the undo notice and the empty state**

`components/review/undo-notice.tsx`:

```tsx
"use client";
import { CheckCircle2 } from "lucide-react";
import type { Ref } from "react";
import { correctionTitle } from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import type { PendingApproval } from "@/lib/review/use-undoable-approval";
import { Button } from "../ui/button";

/** After Approve (review-queue 4). The countdown is plain text, not motion. */
export function UndoNotice({
  pending,
  onUndo,
  undoRef,
}: {
  pending: PendingApproval;
  onUndo(): void;
  undoRef?: Ref<HTMLButtonElement>;
}) {
  const now = useNow(1000);
  const left = Math.max(0, Math.ceil((pending.endsAt - now) / 1000));
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[#a8d9bf] bg-ok-wash px-4 py-3.5 text-[13.5px] text-ok-deep"
    >
      <CheckCircle2 aria-hidden className="size-5 shrink-0" />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <b className="block text-sm">Correction approved</b>
        {correctionTitle(pending.item)}.{" "}
        {pending.item.submitted_by.display_name} will be told, and it goes to
        clinical sign-off before anything changes.
      </div>
      <Button
        ref={undoRef}
        variant="ghost"
        size="sm"
        aria-label="Undo approval"
        onClick={onUndo}
      >
        Undo <span aria-hidden>({left} s)</span>
      </Button>
    </div>
  );
}
```

`components/review/all-caught-up.tsx`:

```tsx
"use client";
import { CheckCircle2 } from "lucide-react";
import { useId } from "react";
import type { CorrectionOut } from "@/lib/api/contract";
import { useMyReviews } from "@/lib/correction-queries";
import { ageLabel, correctionTitle, parseTime } from "@/lib/corrections";
import { StatusChip } from "../corrections/chips";

export function RecentDecisions({
  items,
  now,
}: {
  items: CorrectionOut[];
  now: number;
}) {
  if (!items.length)
    return (
      <p className="px-4 py-3 text-[13px] text-ink-3">
        You haven&apos;t decided any corrections yet.
      </p>
    );
  return (
    <ul aria-label="Your recent decisions" className="flex flex-col">
      {items.map((c) => {
        const t = parseTime(c.decided_at);
        return (
          <li
            key={c.id}
            className="flex items-center gap-2.5 border-t border-line px-4 py-2.5 text-[13px] first:border-0"
          >
            <StatusChip status={c.status} />
            <span className="min-w-0 flex-1 truncate">
              {correctionTitle(c)}
            </span>
            {t !== null && (
              <small className="whitespace-nowrap text-ink-3">
                {ageLabel(t, now)} ago
              </small>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The empty queue is a reward, not a blank page (review-queue 5). */
export function AllCaughtUp({ now }: { now: number }) {
  const q = useMyReviews();
  const id = useId();
  const recent = (q.data ?? []).slice(0, 5);
  return (
    <div className="grid place-items-center px-4 py-10 text-center">
      <div className="w-full max-w-md">
        <span
          aria-hidden
          className="mx-auto mb-3.5 grid size-[76px] place-items-center rounded-3xl bg-ok-wash text-ok"
        >
          <CheckCircle2 className="size-9" />
        </span>
        <h2 className="font-display text-[36px] font-black leading-none">
          All caught up
        </h2>
        <p className="mt-2 text-[14px] text-ink-2">
          No corrections are waiting for you. New ones appear here, and the
          count shows in the sidebar.
        </p>
        {recent.length > 0 && (
          <section aria-labelledby={id} className="card-v3 mt-6 py-2 text-left">
            <h3 id={id} className="px-4 pt-2 text-[13px] font-semibold">
              Your recent decisions
            </h3>
            <RecentDecisions items={recent} now={now} />
          </section>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `npx vitest run components/review lib/motion.test.ts components/ui`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add components/review components/ui/button.tsx
git commit -m "Add the review queue list, detail, undo notice and empty state"
```

---

### Task 11: The review page

**Files:**

- Create: `components/review/review-view.tsx`,
  `components/review/review-view.test.tsx`,
  `app/(clinical)/review/page.tsx`,
  `components/utility/shortcuts-dialog.test.tsx`
- Modify: `components/utility/shortcuts-dialog.tsx`, `CHANGELOG.md`
- Test: `components/review/review-view.test.tsx`, `components/utility/shortcuts-dialog.test.tsx`

**Interfaces:**

- Consumes: everything from Tasks 3–10: `usePendingCorrections`,
  `useMyCorrections`, `useMyReviews`, `useRejectCorrection`,
  `useWithdrawCorrection`, `buildQueue`, `pickNext`, `decisionError`,
  `correctionTitle`, `useUndoableApproval`, `QueueList`, `ReviewDetail`,
  `UndoNotice`, `AllCaughtUp`, `RecentDecisions`, `RejectDialog`,
  `WithdrawDialog`; plus `useAuth` (`user.specialty`), `useNetwork`,
  `useNow`, `useShortcuts`, `useToast`, `TopBar`, `MenuButton`.
- Produces: `ReviewView()` and the page `/review` ("Review corrections ·
  MHAI"); the shortcuts dialog rows "Approve correction (in review)" A and
  "Reject correction (in review)" R.

**State and rules:**

- `selected: QueueItem | null` is a snapshot. Once you're looking at a
  correction it stays on screen until you move on, even if a poll drops it
  (`gone`, Review Focus 1). With nothing selected, the oldest one you can
  decide is selected (R5).
- `handled` hides corrections you decided here until the server agrees;
  the one waiting in the undo window is hidden too. `ownIds` marks ones
  the API called your own (403 `self_approval`, Review Focus 4).
- **Approve:** select the next one you can decide, start the undo window,
  focus Undo. **Undo:** restore and reselect it, focus Approve.
- **Reject:** sends any waiting approval first, then opens the dialog for
  the current correction. Success: toast "Correction rejected" · "{name}
  will see your reason.", then the next one. Failure: the dialog shows why.
- **Withdraw** (your own): sends any waiting approval first, confirms, then
  toasts "Correction withdrawn" and moves on.
- **Skip:** the next row, wrapping round; nothing is sent.
- **A** approves and **R** opens Reject, only when the current correction
  can be decided (`useShortcuts` already ignores typing and open dialogs).
- Filters: "Waiting · N" (every row listed, including yours), "My
  specialty" (when your profile has one; matches the consultation's
  specialty), "Done" (your recent decisions).
- Phones: the list first; choosing a row opens the detail; Back returns.
  The undo notice sits above both, so it stays visible on either.
- 403 from the queue: "Reviewing corrections isn't available for your
  account" (R3). Loading: skeletons. Error: a banner and "Try again".
  Nothing waiting: "All caught up".

- [ ] **Step 1: Write the failing tests**

`components/review/review-view.test.tsx`:

```tsx
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import { REVIEW_POLL_MS } from "@/lib/correction-queries";
import { UNDO_WINDOW_MS } from "@/lib/corrections";
import { renderWithAuth } from "@/tests/auth-wrapper";
import { ToastProvider } from "../ui/toast";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/review",
}));
import { ReviewView } from "./review-view";

const ui = () =>
  renderWithAuth(
    <ToastProvider>
      <input aria-label="Somewhere else" />
      <ReviewView />
    </ToastProvider>,
  );
const heading = (name: string) =>
  screen.findByRole("heading", { name, level: 2 });
const queue = () => screen.findByRole("list", { name: "Waiting corrections" });
const typing = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const offline = () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => void window.dispatchEvent(new Event("offline")));
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  holder.client = createMockClient();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ReviewView", () => {
  it("lists the queue oldest first, flags over 4 hours and marks your own", async () => {
    ui();
    expect(
      await screen.findByRole("button", { name: "Waiting · 4" }),
    ).toHaveAttribute("aria-pressed", "true");
    const rows = within(await queue()).getAllByRole("button");
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Acute asthma, moderate");
    expect(rows[0]).toHaveTextContent("Over 4 h");
    expect(rows[1]).toHaveTextContent("Febrile seizure, simple");
    expect(rows[1]).toHaveTextContent("Your correction");
    expect(rows[1]).toHaveTextContent("Over 4 h");
    expect(rows[2]).toHaveTextContent("Hypokalaemia, cause unclear");
    expect(rows[2]).not.toHaveTextContent("Over 4 h");
    expect(rows[3]).toHaveTextContent("Dengue fever, likely");
  });

  it("opens on the oldest one you can decide, with the compare view", async () => {
    ui();
    expect(await heading("Acute asthma, moderate")).toBeVisible();
    expect(
      screen
        .getByRole("region", { name: "What the system said" })
        .querySelector("del"),
    ).toHaveTextContent("moderate");
    expect(screen.getByText("Dr. Chidi Okafor")).toBeVisible();
  });

  it("approve: undo for 10 seconds, the next one loads, sent only at the end", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(
      screen.getByRole("button", { name: "Approve correction" }),
    );
    expect(screen.getByText("Correction approved")).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo approval" })).toHaveFocus();
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
    expect(
      within(await queue()).queryByText("Acute asthma, moderate"),
    ).toBeNull();
    expect(approve).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve.mock.calls[0]?.[0]).toBe("c-asthma");
    await waitFor(() =>
      expect(screen.queryByText("Correction approved")).toBeNull(),
    );
    expect(
      within(await queue()).queryByText("Acute asthma, moderate"),
    ).toBeNull();
  });

  it("undo brings it back, sends nothing, and returns focus to Approve", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(
      screen.getByRole("button", { name: "Approve correction" }),
    );
    await user.click(screen.getByRole("button", { name: "Undo approval" }));
    expect(await heading("Acute asthma, moderate")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Approve correction" }),
      ).toHaveFocus(),
    );
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS * 2));
    expect(approve).not.toHaveBeenCalled();
  });

  it("A approves and R opens reject, but not while typing or in a dialog", async () => {
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByLabelText("Somewhere else"));
    await user.keyboard("ar");
    expect(screen.queryByText("Correction approved")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(
      screen.getByRole("heading", { name: "Acute asthma, moderate", level: 2 }),
    );
    await user.keyboard("r");
    expect(
      screen.getByRole("dialog", { name: "Why are you rejecting this?" }),
    ).toBeVisible();
    await user.keyboard("a");
    expect(screen.queryByText("Correction approved")).toBeNull();
    await user.keyboard("{Escape}");
    await user.keyboard("a");
    expect(screen.getByText("Correction approved")).toBeVisible();
  });

  it("reject needs a reason, tells you the suggester sees it, then moves on", async () => {
    const user = typing();
    const reject = vi.spyOn(holder.client, "rejectCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    expect(
      within(dialog).getByText("Dr. Okafor will see your reason."),
    ).toBeVisible();
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(within(dialog).getByText("✕ Choose a reason.")).toBeVisible();
    await user.click(
      within(dialog).getByRole("radio", {
        name: "Not supported by guidelines",
      }),
    );
    await user.type(
      within(dialog).getByLabelText("Note (optional)"),
      "BTS says moderate at 92%.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(await screen.findByText("Correction rejected")).toBeVisible();
    expect(screen.getByText("Dr. Okafor will see your reason.")).toBeVisible();
    expect(reject).toHaveBeenCalledWith(
      "c-asthma",
      { reason_code: "not_supported", note: "BTS says moderate at 92%." },
      { idempotencyKey: expect.any(String) },
    );
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
  });

  it("your own: Approve and Reject disabled with the reason; withdraw instead", async () => {
    const user = typing();
    ui();
    await user.click(
      await within(await queue()).findByRole("button", {
        name: /Febrile seizure, simple/,
      }),
    );
    expect(await heading("Febrile seizure, simple")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve correction" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    expect(
      screen.getByText(/You can't review your own correction/),
    ).toBeVisible();
    await user.keyboard("a");
    expect(screen.queryByText("Correction approved")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw this correction?",
    });
    expect(
      within(dialog).getByRole("button", { name: "Keep it" }),
    ).toHaveFocus();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(await screen.findByText("Correction withdrawn")).toBeVisible();
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("list", { name: "Waiting corrections" }),
        ).queryByText("Febrile seizure, simple"),
      ).toBeNull(),
    );
  });

  it("a 403 from the API turns it into your own (Review Focus 4)", async () => {
    const user = typing();
    vi.spyOn(holder.client, "approveCorrection").mockRejectedValueOnce(
      new ApiError(403, "self_approval"),
    );
    ui();
    await heading("Acute asthma, moderate");
    await user.click(
      screen.getByRole("button", { name: "Approve correction" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(
      await screen.findByText("This is your own correction"),
    ).toBeVisible();
    await user.click(
      within(await queue()).getByRole("button", {
        name: /Acute asthma, moderate/,
      }),
    );
    expect(await heading("Acute asthma, moderate")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve correction" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Withdraw my correction" }),
    ).toBeVisible();
  });

  it("someone else decides it while you're rejecting (Review Focus 1)", async () => {
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    await user.type(
      within(dialog).getByLabelText("Note (optional)"),
      "Half written",
    );
    // Another clinician decides it elsewhere; the next poll drops it.
    await holder.client.approveCorrection("c-asthma");
    await act(() => vi.advanceTimersByTimeAsync(REVIEW_POLL_MS));
    expect(
      await within(dialog).findByText(
        "Another clinician has already decided this correction",
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Note (optional)")).toHaveValue(
      "Half written",
    );
    expect(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    ).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(
      screen.getByRole("heading", { name: "Acute asthma, moderate", level: 2 }),
    ).toBeVisible();
    expect(
      screen.getByText("Another clinician has already decided this correction"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Next correction" }));
    expect(await heading("Hypokalaemia, cause unclear")).toBeVisible();
  });

  it("a 409 on sending the rejection says someone decided first", async () => {
    const user = typing();
    vi.spyOn(holder.client, "rejectCorrection").mockRejectedValueOnce(
      new ApiError(409, "already_decided"),
    );
    ui();
    await heading("Acute asthma, moderate");
    await user.click(screen.getByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog", {
      name: "Why are you rejecting this?",
    });
    await user.click(within(dialog).getByRole("radio", { name: "Unsafe" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Reject with reason" }),
    );
    expect(
      await within(dialog).findByText(
        "Another clinician decided this one first",
      ),
    ).toBeVisible();
  });

  it("offline: decisions are disabled and A does nothing (Review Focus 3)", async () => {
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    offline();
    expect(screen.getByText("You're offline")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Approve correction" }),
    ).toBeDisabled();
    await user.keyboard("a");
    expect(screen.queryByText("Correction approved")).toBeNull();
  });

  it("an approval waiting when the connection drops comes back (Review Focus 3)", async () => {
    const user = typing();
    const approve = vi.spyOn(holder.client, "approveCorrection");
    ui();
    await heading("Acute asthma, moderate");
    await user.click(
      screen.getByRole("button", { name: "Approve correction" }),
    );
    offline();
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(approve).not.toHaveBeenCalled();
    expect(await screen.findByText("Your approval wasn't sent")).toBeVisible();
    expect(
      within(await queue()).getByText("Acute asthma, moderate"),
    ).toBeVisible();
  });

  it("all caught up, with your recent decisions, when nothing is waiting", async () => {
    const c = holder.client;
    await c.approveCorrection("c-asthma");
    await c.approveCorrection("c-potassium");
    await c.rejectCorrection("c-dengue", { reason_code: "unsafe" });
    await c.withdrawCorrection("c-seizure");
    ui();
    expect(await heading("All caught up")).toBeVisible();
    const recent = await screen.findByRole("list", {
      name: "Your recent decisions",
    });
    expect(recent).toHaveTextContent("Dengue fever, likely");
    expect(recent).toHaveTextContent("Rejected");
  });

  it("filters to your specialty, and shows your decisions under Done", async () => {
    const user = typing();
    ui();
    await user.click(
      await screen.findByRole("button", { name: "My specialty" }),
    );
    const rows = within(await queue()).getAllByRole("button");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Hypokalaemia, cause unclear");
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(
      await screen.findByRole("list", { name: "Your recent decisions" }),
    ).toHaveTextContent("Warfarin over-anticoagulation");
  });

  it("says when reviewing isn't available for your account (R3)", async () => {
    vi.spyOn(holder.client, "listPendingCorrections").mockRejectedValue(
      new ApiError(403, "forbidden"),
    );
    ui();
    expect(
      await screen.findByText(
        "Reviewing corrections isn't available for your account",
      ),
    ).toBeVisible();
  });

  it("keeps everything in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = typing();
    ui();
    await heading("Acute asthma, moderate");
    await user.click(
      screen.getByRole("button", { name: "Approve correction" }),
    );
    await act(() => vi.advanceTimersByTimeAsync(UNDO_WINDOW_MS));
    expect(setItem).not.toHaveBeenCalled();
  });
});
```

`components/utility/shortcuts-dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShortcutsDialog } from "./shortcuts-dialog";

describe("ShortcutsDialog", () => {
  it("lists the review shortcuts", () => {
    render(<ShortcutsDialog open onClose={() => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveTextContent("Approve correction (in review)A");
    expect(dialog).toHaveTextContent("Reject correction (in review)R");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/review/review-view.test.tsx components/utility/shortcuts-dialog.test.tsx`
Expected: FAIL: `./review-view` can't be resolved, and the shortcuts
dialog has no review rows.

- [ ] **Step 3: Write the review view**

`components/review/review-view.tsx`:

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { RejectIn } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useMyCorrections,
  useMyReviews,
  usePendingCorrections,
  useRejectCorrection,
  useWithdrawCorrection,
} from "@/lib/correction-queries";
import {
  buildQueue,
  correctionTitle,
  decisionError,
  pickNext,
  type DecisionError,
  type QueueItem,
} from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { useShortcuts } from "@/lib/hooks/use-shortcuts";
import { useNetwork } from "@/lib/network";
import { useUndoableApproval } from "@/lib/review/use-undoable-approval";
import { WithdrawDialog } from "../corrections/withdraw-dialog";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AllCaughtUp, RecentDecisions } from "./all-caught-up";
import { QueueList } from "./queue-list";
import { RejectDialog } from "./reject-dialog";
import { ReviewDetail } from "./review-detail";
import { UndoNotice } from "./undo-notice";

type Filter = "waiting" | "specialty" | "done";
const add = (s: ReadonlySet<string>, id: string) => new Set(s).add(id);
const norm = (s: string | null | undefined) => s?.trim().toLowerCase() || null;

/** The corrections review queue (spec §5.4, review-queue.html). */
export function ReviewView() {
  const { user } = useAuth();
  const pending = usePendingCorrections();
  const mine = useMyCorrections();
  const reviews = useMyReviews();
  const { online } = useNetwork();
  const now = useNow(60_000);
  const toast = useToast();
  const reject = useRejectCorrection();
  const withdraw = useWithdrawCorrection();
  const [filter, setFilter] = useState<Filter>("waiting");
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set());
  const [ownIds, setOwnIds] = useState<ReadonlySet<string>>(() => new Set());
  const [mobileDetail, setMobileDetail] = useState(false);
  const [rejectFor, setRejectFor] = useState<QueueItem | null>(null);
  const [rejectError, setRejectError] = useState<DecisionError | null>(null);
  const [withdrawFor, setWithdrawFor] = useState<QueueItem | null>(null);
  const [withdrawError, setWithdrawError] = useState<DecisionError | null>(
    null,
  );
  const [refocus, setRefocus] = useState(0);
  const undoRef = useRef<HTMLButtonElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);

  const approval = useUndoableApproval({
    onSent: (c) => setHandled((h) => add(h, c.id)),
    onFailed: (c, e) => {
      const err = decisionError(e, "approve");
      if (err.gone) setHandled((h) => add(h, c.id));
      if (err.own) setOwnIds((s) => add(s, c.id));
      toast.show({
        title: err.title,
        body:
          err.gone || err.own
            ? `${correctionTitle(c)}. ${err.body}`
            : `${correctionTitle(c)} is back in the queue. ${err.body}`,
        ms: 8000,
      });
    },
  });

  const all = buildQueue(pending.data ?? [], mine.data ?? []).map((i) =>
    ownIds.has(i.c.id) ? { ...i, mine: true } : i,
  );
  const pendingId = approval.pending?.item.id ?? null;
  const visible = all.filter(
    (i) => !handled.has(i.c.id) && i.c.id !== pendingId,
  );
  const specialty = norm(user?.specialty);
  const listed =
    filter === "specialty"
      ? visible.filter((i) => norm(i.c.consultation.specialty) === specialty)
      : visible;

  // Keep the same correction on screen until you move on (Review Focus 1);
  // with nothing selected, open the oldest one you can decide (R5).
  const stale =
    selected !== null &&
    (handled.has(selected.c.id) || selected.c.id === pendingId);
  if (filter !== "done" && (selected === null || stale)) {
    const next = listed.length ? pickNext(listed, 0) : null;
    if ((next?.c.id ?? null) !== (selected?.c.id ?? null)) setSelected(next);
  }
  const fresh = selected
    ? all.find((i) => i.c.id === selected.c.id)
    : undefined;
  const current = selected && !stale ? (fresh ?? selected) : null;
  const gone = current !== null && fresh === undefined;
  const index = current ? listed.findIndex((i) => i.c.id === current.c.id) : -1;
  const canDecide =
    current !== null && !current.mine && !gone && online && filter !== "done";

  /** Select what comes after `from`, as if it had left the list. */
  function moveOn(from: QueueItem) {
    const at = listed.findIndex((i) => i.c.id === from.c.id);
    const rest = listed.filter((i) => i.c.id !== from.c.id);
    const next = rest.length ? pickNext(rest, Math.max(0, at)) : null;
    setSelected(next);
    if (!next) setMobileDetail(false);
  }

  function approve() {
    if (!canDecide || !current) return;
    moveOn(current);
    approval.start(current.c);
  }

  function undo() {
    const item = approval.undo();
    if (!item) return;
    setSelected(
      all.find((i) => i.c.id === item.id) ?? { c: item, mine: false },
    );
    setFilter((f) => (f === "done" ? "waiting" : f));
    setMobileDetail(true);
    setRefocus((n) => n + 1);
  }

  const pendingKey = approval.pending?.key;
  useEffect(() => {
    if (pendingKey) undoRef.current?.focus();
  }, [pendingKey]);
  useEffect(() => {
    if (refocus) approveRef.current?.focus();
  }, [refocus]);

  function openReject() {
    if (!canDecide || !current) return;
    approval.flush();
    setRejectError(null);
    setRejectFor(current);
  }

  function submitReject(r: RejectIn) {
    const target = rejectFor;
    if (!target) return;
    reject.mutate(
      { id: target.c.id, r },
      {
        onSuccess: () => {
          setHandled((h) => add(h, target.c.id));
          setRejectFor(null);
          toast.show({
            title: "Correction rejected",
            body: `${target.c.submitted_by.display_name} will see your reason.`,
            tone: "info",
          });
          if (selected?.c.id === target.c.id) moveOn(target);
        },
        onError: (e) => {
          const err = decisionError(e, "reject");
          if (err.own) setOwnIds((s) => add(s, target.c.id));
          setRejectError(err);
        },
      },
    );
  }

  function openWithdraw() {
    if (!current?.mine || !online || gone) return;
    approval.flush();
    setWithdrawError(null);
    setWithdrawFor(current);
  }

  function confirmWithdraw() {
    const target = withdrawFor;
    if (!target) return;
    withdraw.mutate(
      { id: target.c.id },
      {
        onSuccess: () => {
          setHandled((h) => add(h, target.c.id));
          setWithdrawFor(null);
          toast.show({
            title: "Correction withdrawn",
            body: "It has left the queue, and nothing changed.",
            tone: "info",
          });
          if (selected?.c.id === target.c.id) moveOn(target);
        },
        onError: (e) => setWithdrawError(decisionError(e, "withdraw")),
      },
    );
  }

  function skip() {
    if (!listed.length) return;
    setSelected(listed[(index + 1) % listed.length] ?? null);
  }

  useShortcuts({ a: approve, r: openReject });

  if (!user) return null;
  const header = (
    <TopBar
      title="Review corrections"
      sub="Needs a second clinician"
      leading={<MenuButton />}
    />
  );
  const forbidden =
    pending.error instanceof ApiError && pending.error.status === 403;
  if (forbidden)
    return (
      <>
        {header}
        <div className="p-4 md:p-[26px]">
          <Banner
            tone="info"
            title="Reviewing corrections isn't available for your account"
          >
            Ask your hospital admin if you should be a reviewer.
          </Banner>
        </div>
      </>
    );
  if (pending.isPending || mine.isPending)
    return (
      <>
        {header}
        <div aria-busy="true" className="flex flex-col gap-3 p-4 md:p-[26px]">
          <span className="sr-only">Loading corrections</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </>
    );
  if (!pending.data)
    return (
      <>
        {header}
        <div className="p-4 md:p-[26px]">
          <Banner tone="bad" title="Couldn't load the corrections">
            Check your connection and try again.
          </Banner>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => void pending.refetch()}
          >
            Try again
          </Button>
        </div>
      </>
    );

  const notice = approval.pending && (
    <div className="px-4 pt-4 md:px-[26px]">
      <UndoNotice pending={approval.pending} onUndo={undo} undoRef={undoRef} />
    </div>
  );
  const dialogs = (
    <>
      <RejectDialog
        open={rejectFor !== null}
        onClose={() => setRejectFor(null)}
        submitter={rejectFor?.c.submitted_by.display_name ?? ""}
        gone={rejectFor !== null && !all.some((i) => i.c.id === rejectFor.c.id)}
        busy={reject.isPending}
        error={rejectError}
        onSubmit={submitReject}
      />
      <WithdrawDialog
        open={withdrawFor !== null}
        onClose={() => setWithdrawFor(null)}
        onConfirm={confirmWithdraw}
        busy={withdraw.isPending}
        error={withdrawError}
      />
    </>
  );

  if (visible.length === 0 && filter !== "done")
    return (
      <>
        {header}
        <div className="min-h-0 flex-1 overflow-auto">
          {notice}
          <AllCaughtUp now={now} />
        </div>
        {dialogs}
      </>
    );

  const filters: [Filter, string][] = [
    ["waiting", `Waiting · ${visible.length}`],
    ...(specialty
      ? ([["specialty", "My specialty"]] as [Filter, string][])
      : []),
    ["done", "Done"],
  ];

  return (
    <>
      {header}
      {notice}
      <div className="grid min-h-0 flex-1 md:grid-cols-[330px_minmax(0,1fr)]">
        <section
          aria-label="Corrections queue"
          className={cn(
            "flex min-h-0 flex-col bg-white/70 md:border-r md:border-line",
            mobileDetail && "max-md:hidden",
          )}
        >
          <div className="px-4 pb-2.5 pt-4">
            <p className="text-[12.5px] text-ink-3">
              Each correction needs a second clinician before it changes
              anything.
            </p>
            <div
              role="group"
              aria-label="Show"
              className="mt-3 flex flex-wrap gap-1.5"
            >
              {filters.map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "min-h-11 rounded-full px-3 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep sm:min-h-8",
                    filter === f ? "bg-ink text-white" : "bg-lilac text-ink-2",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {filter === "done" ? (
              <RecentDecisions items={reviews.data ?? []} now={now} />
            ) : listed.length ? (
              <QueueList
                items={listed}
                selectedId={current?.c.id ?? null}
                now={now}
                onSelect={(i) => {
                  setSelected(i);
                  setMobileDetail(true);
                }}
              />
            ) : (
              <p className="px-4 py-3 text-[13px] text-ink-3">
                Nothing is waiting in your specialty.
              </p>
            )}
          </div>
        </section>
        <section
          aria-label="Correction details"
          className={cn(
            "min-h-0 min-w-0 overflow-auto px-4 pb-36 pt-5 md:px-[26px] md:pb-0",
            !mobileDetail && "max-md:hidden",
          )}
        >
          {filter === "done" ? (
            <p className="text-[13.5px] text-ink-3">
              Your recent decisions are listed here. Choose Waiting to carry on
              reviewing.
            </p>
          ) : current ? (
            <ReviewDetail
              item={current}
              now={now}
              position={
                index >= 0 ? { index: index + 1, total: listed.length } : null
              }
              gone={gone}
              online={online}
              busy={reject.isPending || withdraw.isPending}
              onApprove={approve}
              onReject={openReject}
              onSkip={skip}
              onWithdraw={openWithdraw}
              onBack={() => setMobileDetail(false)}
              onNext={() =>
                setSelected(listed.length ? pickNext(listed, 0) : null)
              }
              approveRef={approveRef}
            />
          ) : null}
        </section>
      </div>
      {dialogs}
    </>
  );
}
```

`app/(clinical)/review/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ReviewView } from "@/components/review/review-view";

export const metadata: Metadata = { title: "Review corrections · MHAI" };

export default function ReviewPage() {
  return <ReviewView />;
}
```

- [ ] **Step 4: List the shortcuts**

In `components/utility/shortcuts-dialog.tsx`, add two rows before
`["Show shortcuts", "?"]`:

```ts
    ["Approve correction (in review)", "A"],
    ["Reject correction (in review)", "R"],
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Review corrections: the queue (anything waiting over 4 hours flagged),
  what the system said beside the suggested correction with the changes
  marked, who suggested it and why, the evidence on file and the
  consultation. Approve with a 10-second undo, reject with a required
  reason the suggester sees, skip, and the A and R shortcuts. Your own
  corrections can only be withdrawn. Works on phones, with the reject form
  as a bottom sheet.
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/review components/utility lib/motion.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/review "app/(clinical)/review" components/utility CHANGELOG.md
git commit -m "Add the corrections review page with undo, reject and shortcuts"
```

---

### Task 12: "Review corrections" in the sidebar

**Files:**

- Modify: `components/shell/sidebar.tsx`, `components/shell/sidebar.test.tsx`,
  `CHANGELOG.md`
- Test: `components/shell/sidebar.test.tsx`

**Interfaces:**

- Consumes: `useReviewBadge` (Task 5); `usePathname` (already used).
- Produces: `ReviewLink({ rail, on }: { rail: boolean; on: boolean })`
  (module private) under the search button, in the full sidebar, the
  tablet rail and the mobile drawer (all three render `Sidebar`).

**Behaviour (review-queue.html sidebar, mobile D):**

- "Review corrections" with the ⇄ icon, `href="/review"`,
  `aria-current="page"` on `/review`, mint wash when current.
- The badge is the number of others' waiting corrections (R4), in
  `warn-deep` on white text; the link's name is
  "Review corrections, 3 waiting" (just "Review corrections" with none or
  while loading). In the rail the label is `sr-only` and the badge sits on
  the icon's corner.
- Hidden when the API refuses the queue (403, R3).

- [ ] **Step 1: Write the failing tests**

In `components/shell/sidebar.test.tsx`, replace the imports and the
`next/navigation` mock at the top with:

```tsx
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MhaiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { createMockClient } from "@/lib/api/mock";
import { renderWithAuth } from "@/tests/auth-wrapper";

const holder = vi.hoisted(() => ({ client: null as unknown as MhaiClient }));
vi.mock("@/lib/api/client", () => ({ getClient: () => holder.client }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/c/q1",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
import { Sidebar } from "./sidebar";

beforeEach(() => {
  holder.client = createMockClient();
});
```

and add these tests inside `describe("Sidebar", …)`:

```tsx
it("links to Review corrections with the waiting count", async () => {
  renderWithAuth(<Sidebar items={[]} />);
  const link = await screen.findByRole("link", {
    name: "Review corrections, 3 waiting",
  });
  expect(link).toHaveAttribute("href", "/review");
  expect(link).toHaveTextContent("Review corrections3");
  expect(link).not.toHaveAttribute("aria-current");
});

it("keeps the count in the tablet rail", async () => {
  renderWithAuth(<Sidebar items={[]} rail />);
  expect(
    await screen.findByRole("link", { name: "Review corrections, 3 waiting" }),
  ).toBeVisible();
  expect(screen.getByText("Review corrections")).toHaveClass("sr-only");
});

it("drops the count when nothing is waiting", async () => {
  const list = vi
    .spyOn(holder.client, "listPendingCorrections")
    .mockResolvedValue([]);
  renderWithAuth(<Sidebar items={[]} />);
  await waitFor(() => expect(list).toHaveBeenCalled());
  expect(
    await screen.findByRole("link", { name: "Review corrections" }),
  ).not.toHaveTextContent(/\d/);
});

it("hides the entry when reviewing isn't available (403)", async () => {
  vi.spyOn(holder.client, "listPendingCorrections").mockRejectedValue(
    new ApiError(403, "forbidden"),
  );
  renderWithAuth(<Sidebar items={[]} />);
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: /Review corrections/ }),
    ).toBeNull(),
  );
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run components/shell/sidebar.test.tsx`
Expected: FAIL: no link named "Review corrections, 3 waiting".

- [ ] **Step 3: Add the entry**

In `components/shell/sidebar.tsx`, add `ArrowLeftRight` to the
`lucide-react` import and `import { useReviewBadge } from "@/lib/correction-queries";`,
then add this component above `Sidebar`:

```tsx
/** The queue with others' waiting count (R4); hidden if you can't review (R3). */
function ReviewLink({ rail, on }: { rail: boolean; on: boolean }) {
  const { count, forbidden } = useReviewBadge();
  if (forbidden) return null;
  const name = count
    ? `Review corrections, ${count} waiting`
    : "Review corrections";
  return (
    <Link
      href="/review"
      title="Review corrections"
      aria-label={name}
      aria-current={on ? "page" : undefined}
      className={cn(
        "mt-2.5 flex min-h-11 items-center gap-2.5 rounded-xl text-[13.5px] font-semibold",
        rail ? "relative w-11 justify-center" : "px-2.5",
        on
          ? "bg-mint-wash text-mint-deep shadow-[inset_3px_0_0_var(--color-mint)]"
          : "text-ink-2 hover:bg-bg",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          on ? "bg-white" : "bg-lilac text-bloom",
        )}
      >
        <ArrowLeftRight className="size-3.5" />
      </span>
      <span className={rail ? "sr-only" : ""}>Review corrections</span>
      {count ? (
        <span
          aria-hidden
          className={cn(
            "rounded-full bg-warn-deep px-2 py-0.5 font-mono text-[11px] font-bold text-white",
            rail ? "absolute -right-1 -top-1" : "ml-auto",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
```

and render it right after the search `<button>…</button>` in `Sidebar`:

```tsx
<ReviewLink rail={rail} on={path === "/review"} />
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- "Review corrections" in the sidebar (and the tablet rail and phone menu),
  with how many corrections are waiting for you.
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `npx vitest run components/shell components/states components/consultation components/utility`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/shell/sidebar.tsx components/shell/sidebar.test.tsx CHANGELOG.md
git commit -m "Add Review corrections to the sidebar with the waiting count"
```

---

### Task 13: "My feedback" on the account page

**Files:**

- Create: `components/account/feedback-section.tsx`
- Modify: `components/account/account-view.tsx`,
  `components/account/account-view.test.tsx`, `CHANGELOG.md`
- Test: `components/account/account-view.test.tsx`

**Interfaces:**

- Consumes: `useFeedbackStats` (Task 5); `Skeleton`; the mock stats
  (Task 1: 42 agreed, 1 waiting, 1 approved, 1 rejected).
- Produces: `FeedbackSection()`: a `card-v3` section with `id="feedback"`,
  named "My feedback"; the account section menu gains "My feedback" →
  `#feedback`.

**Behaviour (account.html 5, mobile C):** "My feedback" · "How your reviews
help improve the system." Four counts as a description list: Results
agreed, Corrections waiting, Corrections approved, Corrections rejected
(numbers in the display face, `tabular`, never animated). A link "See my
feedback & corrections ›" to `/my-feedback`. Loading: a skeleton; error:
"Your feedback numbers aren't available right now." (the link stays).

- [ ] **Step 1: Write the failing test**

Add to `components/account/account-view.test.tsx`, inside
`describe("AccountView", …)` (it uses the real mock client, as the file
already does):

```tsx
it("shows your feedback counts and links to My feedback & corrections", async () => {
  await signedIn();
  const section = await screen.findByRole("region", { name: "My feedback" });
  const agreed = await within(section).findByText("Results agreed");
  expect(agreed.parentElement).toHaveTextContent("Results agreed42");
  expect(
    within(section).getByText("Corrections waiting").parentElement,
  ).toHaveTextContent("Corrections waiting1");
  expect(
    within(section).getByText("Corrections approved").parentElement,
  ).toHaveTextContent("Corrections approved1");
  expect(
    within(section).getByText("Corrections rejected").parentElement,
  ).toHaveTextContent("Corrections rejected1");
  expect(
    within(section).getByRole("link", {
      name: /See my feedback & corrections/,
    }),
  ).toHaveAttribute("href", "/my-feedback");
  expect(
    within(
      screen.getByRole("navigation", { name: "Account sections" }),
    ).getByRole("link", { name: "My feedback" }),
  ).toHaveAttribute("href", "#feedback");
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `npx vitest run components/account/account-view.test.tsx`
Expected: FAIL: no region named "My feedback".

- [ ] **Step 3: Write the section**

`components/account/feedback-section.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useFeedbackStats } from "@/lib/correction-queries";
import { Skeleton } from "../ui/skeleton";

/** Feedback stats on Profile & security (spec §5.5, account.html 5). */
export function FeedbackSection() {
  const q = useFeedbackStats();
  const s = q.data;
  const counts: [string, number][] = s
    ? [
        ["Results agreed", s.agreed],
        ["Corrections waiting", s.corrections_waiting],
        ["Corrections approved", s.corrections_approved],
        ["Corrections rejected", s.corrections_rejected],
      ]
    : [];
  return (
    <section
      id="feedback"
      aria-labelledby="feedback-h"
      className="card-v3 scroll-mt-4 px-[22px] py-5"
    >
      <h2 id="feedback-h" className="text-base font-semibold">
        My feedback
      </h2>
      <p className="mb-3.5 mt-1 text-[13px] text-ink-3">
        How your reviews help improve the system.
      </p>
      {q.isPending ? (
        <Skeleton className="h-[74px]" />
      ) : !s ? (
        <p className="text-[13px] text-ink-3">
          Your feedback numbers aren&apos;t available right now.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {counts.map(([label, n]) => (
            <div
              key={label}
              className="flex flex-col-reverse rounded-2xl bg-lilac px-3.5 py-3"
            >
              <dt className="mt-1 text-[12px] text-ink-2">{label}</dt>
              <dd className="tabular font-display text-[30px] font-black leading-none text-bloom">
                {n}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Link
        href="/my-feedback"
        className="mt-4 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-mint-deep"
      >
        See my feedback &amp; corrections ›
      </Link>
    </section>
  );
}
```

- [ ] **Step 4: Add it to the account page**

In `components/account/account-view.tsx`:

- import `import { FeedbackSection } from "./feedback-section";`;
- make the section menu end with "My feedback":

```tsx
const sections = [
  ["profile", "Profile"],
  ["security", "Security"],
  ...(capabilities.devices ? [["devices", "Devices"]] : []),
  ["feedback", "My feedback"],
];
```

- render it after the devices section:

```tsx
{
  capabilities.devices && <DevicesSection />;
}
<FeedbackSection />;
```

Add to `CHANGELOG.md` under _Unreleased_ → Added:

```markdown
- Profile & security shows your feedback: results you agreed with, and
  your corrections waiting, approved and rejected, with a link to My
  feedback & corrections.
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run components/account`
Expected: PASS.

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/account CHANGELOG.md
git commit -m "Show your feedback counts on the account page"
```

---

### Task 14: End-to-end review and My corrections, and the README

**Files:**

- Create: `tests/e2e/review.spec.ts`
- Modify: `tests/e2e/helpers.ts` (`openReview`), `README.md` ("Run on mock
  data"), `tests/readme.test.ts`
- Test: `tests/e2e/review.spec.ts` (desktop and mobile projects), `tests/readme.test.ts`

**Interfaces:**

- Consumes: every screen from Tasks 6–13 in mock mode (the e2e server runs
  with `NEXT_PUBLIC_USE_MOCK=true`); the helpers `signIn`, `fillForm`,
  `openAccountMenu`, `isMobile`, `expectNoStorage`,
  `expectNoForbiddenWords`; the seeded corrections (Task 1).
- Produces: `openReview(page: Page): Promise<void>` in
  `tests/e2e/helpers.ts`.

Every `page.goto` is a full load, which signs the mock out, so each test
signs in once and then moves around in-app. The undo is never waited out in
real time: tests that need it call `page.clock.install()` before the first
`goto` and then `page.clock.fastForward(…)`. Both projects (desktop 1440 px
and Pixel 7) run every test except the keyboard one.

- [ ] **Step 1: Add the helper**

Append to `tests/e2e/helpers.ts`:

```ts
/** From a signed-in screen: opens Review corrections (from the menu on phones). */
export async function openReview(page: Page) {
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("link", { name: /^Review corrections/ })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/review$/);
}
```

- [ ] **Step 2: Write the e2e spec**

`tests/e2e/review.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  expectNoForbiddenWords,
  expectNoStorage,
  fillForm,
  isMobile,
  openAccountMenu,
  openReview,
  signIn,
} from "./helpers";

test.afterEach(async ({ page }) => {
  // Corrections and decisions are clinical content: never in storage.
  await expectNoStorage(page);
  await expectNoForbiddenWords(page);
});

async function start(page: Page) {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openReview(page);
}
const row = (page: Page, title: string) =>
  page
    .getByRole("list", { name: "Waiting corrections" })
    .getByRole("button", { name: new RegExp(title) });
const title = (page: Page, name: string) =>
  page.getByRole("heading", { level: 2, name });
const undoNotice = (page: Page) =>
  page.getByRole("status").filter({ hasText: "Correction approved" });
/** On phones the list and the detail are separate screens. */
const backToQueue = async (page: Page) => {
  if (isMobile(page))
    await page.getByRole("button", { name: "Back to the queue" }).click();
};

test("the sidebar counts what's waiting for you", async ({ page }) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await expect(
    page
      .getByRole("link", { name: "Review corrections, 3 waiting" })
      .filter({ visible: true }),
  ).toBeVisible();
});

test("approve, undo, approve again: sent after 10 seconds", async ({
  page,
}) => {
  await page.clock.install();
  await start(page);
  await row(page, "Acute asthma, moderate").click();
  await expect(title(page, "Acute asthma, moderate")).toBeVisible();
  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(undoNotice(page)).toBeVisible();
  // The next one loads straight away.
  await expect(title(page, "Hypokalaemia, cause unclear")).toBeVisible();
  await page.getByRole("button", { name: "Undo approval" }).click();
  await expect(undoNotice(page)).toBeHidden();
  await expect(title(page, "Acute asthma, moderate")).toBeVisible();

  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(undoNotice(page)).toBeVisible();
  await page.clock.fastForward(10_000);
  await expect(undoNotice(page)).toBeHidden();
  await backToQueue(page);
  await expect(row(page, "Acute asthma, moderate")).toHaveCount(0);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Your recent decisions" }),
  ).toContainText("Acute asthma, moderate");
});

test("leaving during the undo window sends the approval at once", async ({
  page,
}) => {
  await start(page);
  await row(page, "Dengue fever, likely").click();
  await page.getByRole("button", { name: "Approve correction" }).click();
  await expect(undoNotice(page)).toBeVisible();
  // Leave inside the 10 seconds, without waiting them out.
  if (isMobile(page))
    await page.getByRole("button", { name: "Open menu" }).click();
  await page
    .getByRole("link", { name: "Help" })
    .filter({ visible: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await openReview(page);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Your recent decisions" }),
  ).toContainText("Dengue fever, likely");
});

test("reject needs a reason, and the suggester will see it", async ({
  page,
}) => {
  await start(page);
  await row(page, "Dengue fever, likely").click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  // A dialog on desktop, a bottom sheet on phones.
  const dialog = page.getByRole("dialog", { name: /reject/i });
  await dialog.getByRole("button", { name: "Reject with reason" }).click();
  await expect(dialog.getByText("Choose a reason.")).toBeVisible();
  await dialog.getByText("Partly right, needs rewording").click();
  await dialog
    .getByLabel("Note (optional)")
    .fill("Keep the platelet trigger as well (WHO §3.4). ñ 🙂");
  await expect(
    dialog.getByText("Dr. Okafor will see your reason."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Reject with reason" }).click();
  await expect(page.getByText("Correction rejected")).toBeVisible();
  await expect(dialog).toBeHidden();
  await backToQueue(page);
  await expect(row(page, "Dengue fever, likely")).toHaveCount(0);
});

test("your own correction can't be approved; you can withdraw it", async ({
  page,
}) => {
  await start(page);
  await row(page, "Febrile seizure, simple").click();
  await expect(
    page.getByText("You can't review your own correction."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve correction" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Reject", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("a");
  await expect(undoNotice(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Withdraw my correction" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Withdraw this correction?",
  });
  await expect(dialog.getByRole("button", { name: "Keep it" })).toBeFocused();
  await dialog.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page.getByText("Correction withdrawn")).toBeVisible();
});

test("A and R work in review and are listed under ?", async ({ page }) => {
  test.skip(isMobile(page), "keyboard shortcuts are for keyboards");
  await start(page);
  await row(page, "Hypokalaemia, cause unclear").click();
  await page.keyboard.press("r");
  const dialog = page.getByRole("dialog", {
    name: "Why are you rejecting this?",
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.keyboard.press("a");
  await expect(undoNotice(page)).toBeVisible();
  await page.getByRole("button", { name: "Undo approval" }).click();
  await page.keyboard.press("?");
  await expect(
    page.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toContainText("Approve correction (in review)");
});

test("my feedback & corrections: statuses, the reviewer's reason, withdraw", async ({
  page,
}) => {
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await openAccountMenu(page);
  await page
    .getByRole("menuitem", { name: "My feedback & corrections" })
    .click();
  await expect(page).toHaveURL(/\/my-feedback$/);
  await expect(page.getByRole("button", { name: "All · 3" })).toBeVisible();
  const list = page.getByRole("list", { name: "Your corrections" });
  await expect(list).toContainText("Approved by Dr. Okafor");
  await expect(list).toContainText("Rejected by Nurse Bello");
  await expect(list).toContainText(
    'Partly right, needs rewording: Keep "cause unclear"',
  );
  await list
    .getByRole("button", { name: "Withdraw: Febrile seizure, simple" })
    .click();
  await page
    .getByRole("dialog", { name: "Withdraw this correction?" })
    .getByRole("button", { name: "Withdraw", exact: true })
    .click();
  await expect(page.getByText("Correction withdrawn")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Withdrawn · 1" }),
  ).toBeVisible();
});

test("a reviewer's decision arrives as a toast and stays in the bell", async ({
  page,
}) => {
  await page.clock.install();
  await signIn(page);
  await expect(page).toHaveURL(/\/$/);
  await fillForm(page, "Fever 3 days and rash, dengue area. Admit?");
  await page.getByRole("button", { name: /Analyse/ }).click();
  await page.getByRole("button", { name: /Suggest correction/ }).click();
  await page
    .getByLabel(/What should the diagnosis/)
    .fill("Dengue fever with warning signs: admit");
  await page.getByLabel(/Why\?/).fill("Persistent vomiting is a warning sign.");
  await page.getByRole("button", { name: "Submit correction" }).click();
  await expect(page.getByText(/sent for review/)).toBeVisible();
  // The demo reviewer decides two minutes later; polling picks it up.
  await page.clock.fastForward("02:30");
  await expect(page.getByText("Your correction was approved")).toBeVisible();
  await page
    .getByRole("button", { name: "Decisions on your corrections, 1 new" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Decisions this session" }),
  ).toContainText("Dengue fever, likely");
});
```

- [ ] **Step 3: Run the e2e spec to see it pass**

Run: `npm run e2e -- tests/e2e/review.spec.ts`
Expected: PASS on both projects (the keyboard test is skipped on mobile).
The webServer builds with `NEXT_PUBLIC_USE_MOCK=true`. If a test fails,
read its trace (`test-results/…/trace.zip`) before changing anything; none
of these tests depends on real time passing.

Run the whole suite once: `npm run e2e`
Expected: PASS (the account, clinical-flow, network and offline specs are
unchanged by this plan apart from the extra sidebar link and top-bar bell).

- [ ] **Step 4: Describe the review demo**

In `README.md`, under "Run on mock data", after the paragraph that ends
"A result arrives after about 9 seconds.", add:

```markdown
**Corrections and review.** The sample data is written for the clinician
sample account (Dr. Reyes). **Review corrections** in the sidebar holds
sample corrections from Dr. Okafor and Nurse Bello, some waiting over 4
hours, and one of your own, which you can withdraw but not approve.
Approve gives you 10 seconds to undo; Reject needs a reason, which the
person who suggested it sees. **My feedback & corrections** (account menu)
lists your corrections as waiting, approved or rejected, with the
reviewer's reason, and Profile & security shows your counts. A correction
you suggest on a result gets a decision about two minutes later: approved,
or rejected with a reason if its "Why?" contains the word "unsure". The
bell in the top bar keeps this session's decisions. Like the rest of the
demo, all of it is in memory only.
```

Add to `tests/readme.test.ts`, inside the `describe`:

```ts
it("documents the review demo and its trigger word", () => {
  expect(readme).toMatch(/\*\*Review corrections\*\* in the sidebar/);
  expect(readme).toMatch(/contains the word "unsure"/);
});
```

- [ ] **Step 5: Run the unit suite, the checks and the build**

Run: `npx vitest run tests/readme.test.ts && npm test`
Expected: PASS.

Run: `npm run lint && npm run typecheck && npm run format:check && npm run build`
Expected: all clean (run `npm run format` first if `format:check` lists
files).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/review.spec.ts tests/e2e/helpers.ts README.md tests/readme.test.ts
git commit -m "Test review and My corrections end to end; describe the demo"
```

---

## Self-review notes

- **Spec coverage, §5.3 My corrections:**
  - your corrections as waiting, approved or rejected, with the reviewer's
    reason: Task 7 (plus withdrawn, and withdraw and resubmit);
  - a toast when a decision arrives and a bell with the history: Task 6,
    end to end in Task 14;
  - the shortcuts dialog's "in review, A approves and R rejects": Task 11.
- **Spec coverage, §5.4 review queue:**
  - the queue on the left with anything over 4 hours flagged
    (`REVIEW_OVERDUE_MS`): Tasks 3 and 10;
  - what the system said beside the correction, changes highlighted
    without relying on colour: Tasks 3 (diff) and 4 (view);
  - who suggested it, why, the evidence on file and a link to the
    consultation: Tasks 4 and 10 (R7);
  - Approve, Reject and Skip in a bottom bar, with A and R: Tasks 10 and
    11;
  - Reject needs a reason (chips and a note) the suggester sees: Tasks 8,
    11 and 7 (where the suggester reads it);
  - your own: Approve and Reject disabled with an explanation, Withdraw
    instead, and the API's 403 `self_approval` handled: Tasks 10, 11 and 3;
  - after approving, a 10-second undo, then the next item: Tasks 9 and 11
    (R1);
  - empty queue, "All caught up" and recent decisions: Task 10;
  - the sidebar entry with the count: Task 12; mobile layout: Tasks 8, 10,
    11 and the mobile e2e project (Task 14).
- **Spec coverage, §5.5:** the account menu's "My feedback" item (as
  "My feedback & corrections", the mockup's label): Task 7; feedback stats
  on Profile & security and the "My feedback" section menu entry: Task 13.
- **Spec coverage, §10 item 1:** reject with a reason, withdraw, "my
  corrections" and polling for decisions: Tasks 1, 2 and 5, with the
  assumed contract written into the spec in Task 2.
- **Global constraints honoured in code:** no backend terms (Task 1 adds
  the codes to `FORBIDDEN_TERMS`, Task 3 tests the copy, every e2e test
  checks the page); memory only (each data task has a storage test, and
  every e2e test ends with `expectNoStorage`); decisions not queued
  offline (Tasks 5, 9, 11); word plus icon for every status (Task 4);
  focus, Esc and safe defaults (Tasks 6, 7, 8, 11); 44 px targets
  (`min-h-11` below `sm`); motion tokens only (`lib/motion.test.ts` runs in
  Tasks 4, 10, 11).
- **Names used across tasks:** `CorrectionOut`, `QueueItem`,
  `DecisionError`, `PendingApproval`, `CORRECTION_KEYS`,
  `refreshCorrections`, `REVIEW_OVERDUE_MS`, `UNDO_WINDOW_MS`,
  `REVIEW_POLL_MS`, `DECISION_POLL_MS`, `NOTE_MAX`, the seeded ids
  (`c-asthma`, `c-potassium`, `c-dengue`, `c-seizure`, `c-nstemi`,
  `c-vomiting`, `c-warfarin`) and the routes `/review` and `/my-feedback`
  are defined once (Tasks 1, 3, 5, 9) and used with the same spelling
  after.
- **Still open (for the spec owners):**
  - the real review turnaround (4 h is a placeholder) and whether reviewers
    are limited to their specialty (R3 is a stopgap);
  - whether a hospital admin who isn't a clinician should see queue
    counts (Plan 4);
  - reviewers seeing another clinician's consultation (the question as
    asked, masked) is needed to review it, but it is clinical content
    crossing between clinicians: it needs clinical and privacy sign-off on
    the backend's `original` and `consultation` fields;
  - swiping between items on mobile (R11);
  - "we've reminded the reviewers" (review-queue tab 3) needs reminder data
    from the backend.
