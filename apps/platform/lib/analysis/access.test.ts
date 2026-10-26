import { describe, expect, it } from "vitest";
import type { AccessEntry } from "../api/analysis-contract";
import { accessLine, countText, readAccessPage } from "./access";

const ADA = { id: "tm_ada", name: "Ada Bakare" };
const TUNDE = { id: "tm_tunde", name: "Tunde Okafor" };
const HAVANA = { id: "h_havana", name: "Havana Hospital" };

const visit: AccessEntry = {
  id: "aa_1",
  at: "2026-10-20T10:00:00.000Z",
  actor: ADA,
  kind: "visit",
  scope: "all",
  hospital: null,
  view: "prevalence",
  period: "12m",
  filters: [
    { key: "age_band", label: "Age 40–59" },
    { key: "sex", label: "Female" },
  ],
  count: null,
  clearance_id: null,
  flagged: false,
};
const download: AccessEntry = {
  ...visit,
  id: "aa_2",
  actor: TUNDE,
  kind: "download",
  scope: "hospital",
  hospital: HAVANA,
  view: "affected",
  period: "6m",
  filters: [],
};
const list: AccessEntry = {
  ...visit,
  id: "aa_3",
  kind: "patient_list",
  scope: "hospital",
  hospital: HAVANA,
  view: "findings",
  filters: [],
  count: 37,
  clearance_id: "CL_hav_01",
  flagged: true,
};
const page = (entries: unknown[], next_cursor: string | null = null) => ({
  entries,
  next_cursor,
});
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe("accessLine", () => {
  it("says what a visit looked at, where, when and with which filters", () => {
    expect(accessLine(visit)).toBe(
      "Ada Bakare looked at Prevalence and trends · All hospitals · Last 12 months · Age 40–59, Female",
    );
  });
  it("says a download, with no filters part when there are none", () => {
    expect(accessLine(download)).toBe(
      "Tunde Okafor downloaded Who is affected as CSV · Havana Hospital · Last 6 months",
    );
  });
  it("says a patient list with its count and its letter", () => {
    expect(accessLine(list)).toBe(
      "Ada Bakare opened 37 de-identified patients at Havana Hospital · Findings and alerts · letter CL_hav_01",
    );
  });
  it("shows a patient-list count of 1 to 4 as Fewer than 5", () => {
    for (const n of [1, 4])
      expect(accessLine({ ...list, count: n })).toBe(
        "Ada Bakare opened Fewer than 5 de-identified patients at Havana Hospital · Findings and alerts · letter CL_hav_01",
      );
    expect(accessLine({ ...list, count: 5 })).toContain(
      "opened 5 de-identified",
    );
    expect(accessLine({ ...list, count: 0 })).toContain(
      "opened 0 de-identified",
    );
    expect(countText(3)).toBe("Fewer than 5");
    expect(countText(0)).toBe("0");
    expect(countText(5)).toBe("5");
  });
});

describe("readAccessPage", () => {
  it("reads a good page", () => {
    const r = readAccessPage(page([visit, download, list], "n1"));
    expect(r).toEqual({
      status: "ok",
      data: { entries: [visit, download, list], next_cursor: "n1" },
    });
  });
  it("reads an empty page", () => {
    expect(readAccessPage(page([])).status).toBe("ok");
  });
  it("fails closed on anything that is not a page", () => {
    expect(readAccessPage(null).status).toBe("failed");
    expect(readAccessPage({ entries: [] }).status).toBe("failed");
    expect(readAccessPage({ ...page([]), extra: 1 }).status).toBe("failed");
    expect(readAccessPage(page([visit], 4 as unknown as string)).status).toBe(
      "failed",
    );
  });
  it("fails closed when flagged is anything but a patient list", () => {
    expect(readAccessPage(page([{ ...visit, flagged: true }])).status).toBe(
      "failed",
    );
    expect(readAccessPage(page([{ ...download, flagged: true }])).status).toBe(
      "failed",
    );
    expect(readAccessPage(page([{ ...list, flagged: false }])).status).toBe(
      "failed",
    );
    expect(readAccessPage(page([{ ...list, flagged: "yes" }])).status).toBe(
      "failed",
    );
  });
  it("fails closed when count or letter sits on another kind", () => {
    expect(readAccessPage(page([{ ...visit, count: 3 }])).status).toBe(
      "failed",
    );
    expect(
      readAccessPage(page([{ ...download, clearance_id: "cl_1" }])).status,
    ).toBe("failed");
  });
  it("fails closed on a patient list across hospitals", () => {
    expect(
      readAccessPage(page([{ ...list, scope: "all", hospital: null }])).status,
    ).toBe("failed");
  });
  it("fails closed when a patient list has no count or no letter", () => {
    expect(readAccessPage(page([{ ...list, count: null }])).status).toBe(
      "failed",
    );
    expect(readAccessPage(page([{ ...list, clearance_id: null }])).status).toBe(
      "failed",
    );
  });
  it("fails closed on an unknown filter key or a label over 80 characters", () => {
    expect(
      readAccessPage(
        page([{ ...visit, filters: [{ key: "ward", label: "A" }] }]),
      ).status,
    ).toBe("failed");
    expect(
      readAccessPage(
        page([{ ...visit, filters: [{ key: "sex", label: "x".repeat(81) }] }]),
      ).status,
    ).toBe("failed");
    expect(
      readAccessPage(
        page([{ ...visit, filters: [{ key: "sex", label: "x".repeat(80) }] }]),
      ).status,
    ).toBe("ok");
    expect(
      readAccessPage(
        page([{ ...visit, filters: [{ key: "sex", label: "Female", x: 1 }] }]),
      ).status,
    ).toBe("failed");
  });
  it("fails closed on an id that is not opaque", () => {
    for (const bad of [
      { ...visit, id: "aa 1" },
      { ...visit, actor: { ...ADA, id: "ada@x.example" } },
      { ...download, hospital: { ...HAVANA, id: "h/havana" } },
      { ...list, clearance_id: "CL 01" },
    ])
      expect(readAccessPage(page([bad])).status).toBe("failed");
  });
  it("fails closed on any patient key, at any depth", () => {
    for (const k of [
      "pid",
      "mrn",
      "dob",
      "date_of_birth",
      "address",
      "patient_name",
    ]) {
      expect(readAccessPage(page([{ ...visit, [k]: "x" }])).status).toBe(
        "failed",
      );
      const nested = clone(visit) as Record<string, unknown>;
      nested.actor = { ...ADA, [k]: "x" };
      expect(readAccessPage(page([nested])).status).toBe("failed");
    }
  });
  it("fails closed on a wrong kind, scope, view, period or time", () => {
    for (const bad of [
      { ...visit, kind: "peek" },
      { ...visit, scope: "some" },
      { ...visit, view: "everything" },
      { ...visit, period: "1m" },
      { ...visit, at: "yesterday" },
      { ...visit, scope: "hospital" },
      { ...download, scope: "all" },
    ])
      expect(readAccessPage(page([bad])).status).toBe("failed");
  });
});
