import type {
  CorrectionOriginalOut,
  CorrectionOut,
  CorrectionStatus,
  RejectReasonCode,
} from "./api/contract";
import { ApiError } from "./api/errors";
import type { ResultKind } from "./labels";
import { resultKind } from "./result-view";
import { ageLabel } from "./time";

export { ageLabel };

/** Placeholder turnaround (spec §11): waiting this long gets flagged. */
export const REVIEW_OVERDUE_MS = 4 * 60 * 60_000;
export const OVERDUE_LABEL = `Over ${REVIEW_OVERDUE_MS / 3_600_000} h`;
/** After Approve, this long to undo before the approval is sent (ruling R1). */
export const UNDO_WINDOW_MS = 60_000;
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

/** What the system said, on the result screen's labels (same rule as the result). */
export function originalKind(
  o: Pick<CorrectionOriginalOut, "decision" | "degraded">,
): ResultKind {
  return resultKind(o);
}

export const correctionTitle = (c: Pick<CorrectionOut, "original">) =>
  c.original.diagnosis?.trim() || "Consultation";

export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
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
          : "Another clinician has already decided this correction",
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
