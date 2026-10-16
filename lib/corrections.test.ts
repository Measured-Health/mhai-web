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
    expect(ageLabel(T0 - 3 * H - 59 * 60_000, T0)).toBe("4 h");
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
      title: "Another clinician has already decided this correction",
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
