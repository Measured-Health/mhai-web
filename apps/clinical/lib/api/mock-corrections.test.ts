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
