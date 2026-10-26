import { describe, expect, it } from "vitest";
import type { AnalysisStatus } from "@/lib/api/analysis-contract";
import type { ViewState } from "@/lib/analysis/read";
import { ADA, AMARA } from "@/tests/render";
import { NAV, visibleNav } from "./nav";

const status = (over: Partial<AnalysisStatus> = {}): AnalysisStatus => ({
  aggregates_enabled: true,
  patient_views_enabled: true,
  sample: true,
  hospitals: { included: 0, total: 0, list: [], excluded: [] },
  my_clearances: [],
  ...over,
});
const ok = (s: AnalysisStatus): ViewState<AnalysisStatus> => ({
  status: "ok",
  data: s,
});
const labels = (items: { label: string }[]) => items.map((i) => i.label);

describe("visibleNav", () => {
  it("a platform admin sees Analysis after Usage, with Sample data", () => {
    const items = visibleNav(ADA, ok(status()));
    expect(labels(items)).toEqual([
      "Hospitals",
      "Connections",
      "Usage",
      "Analysis",
      "Clearances",
      "Legal holds",
      "System",
      "Settings",
      "Team",
      "Activity",
      "Audit log",
      "Account",
    ]);
    const analysis = items.find((i) => i.label === "Analysis")!;
    expect(analysis.href).toBe("/analysis");
    expect(analysis.sample).toBe(true);
    // Live data has no sign.
    const live = visibleNav(ADA, ok(status({ sample: false })));
    expect(live.find((i) => i.label === "Analysis")!.sample).toBe(false);
  });

  it("an auditor never sees it", () => {
    expect(labels(visibleNav(AMARA, ok(status())))).not.toContain("Analysis");
    // Not even with both roles' status read for someone else.
    expect(labels(visibleNav(null, ok(status())))).not.toContain("Analysis");
  });

  it("with the status loading, failed or off, nobody sees it", () => {
    for (const s of [
      undefined,
      { status: "failed" } as const,
      ok(status({ aggregates_enabled: false })),
    ])
      expect(labels(visibleNav(ADA, s))).not.toContain("Analysis");
    // Everything else is always there.
    expect(visibleNav(ADA, undefined)).toHaveLength(NAV.length - 1);
  });
});
