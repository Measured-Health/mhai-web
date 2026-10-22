import { beforeEach, describe, expect, it } from "vitest";
import type { ActivityEventOut } from "./admin-contract";
import { auditEvents, recordAudit, resetAudit } from "./mock-audit";

const event: Omit<ActivityEventOut, "id"> = {
  at: "2026-10-22T08:00:00.000Z",
  type: "admin",
  kind: "analysis_patients_viewed",
  actor: { display_name: "Dr Mensah" },
  target: null,
  specialty: null,
  confidence: null,
  device: null,
  count: 12,
  flag: null,
};

beforeEach(resetAudit);

describe("sample audit trail", () => {
  it("starts empty and keeps what was recorded, with its own ids", () => {
    expect(auditEvents()).toEqual([]);
    recordAudit(event);
    recordAudit({ ...event, count: 5 });
    const all = auditEvents();
    expect(all.map((e) => e.count)).toEqual([12, 5]);
    expect(new Set(all.map((e) => e.id)).size).toBe(2);
    expect(all[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hands out copies, and resets", () => {
    recordAudit(event);
    auditEvents()[0].count = 99;
    expect(auditEvents()[0].count).toBe(12);
    resetAudit();
    expect(auditEvents()).toEqual([]);
  });
});
