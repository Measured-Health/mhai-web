import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "./api/analysis";
import type { AffectedOut } from "./api/analysis-contract";
import { createMockAnalysis } from "./api/mock-analysis";
import { defaultFilters } from "./analysis/filters";

const holder = vi.hoisted(() => ({
  client: null as unknown as AnalysisClient,
}));
vi.mock("./api/analysis", () => ({ getAnalysisClient: () => holder.client }));
import {
  ANALYSIS_KEYS,
  hideAllWhenFew,
  useAnalysisView,
  usePatients,
} from "./analysis-queries";

const F = defaultFilters("2026-10-22");
const H = { value: null, suppressed: true };
const S = (value: number) => ({ value, suppressed: false });

function wrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("analysis queries", () => {
  it("keeps every key under analysis, so sign-out clears them", () => {
    for (const key of [
      ANALYSIS_KEYS.filters,
      ANALYSIS_KEYS.view("prevalence", F),
      ANALYSIS_KEYS.patients(null),
      ANALYSIS_KEYS.patients({
        drill: "cond-e11",
        level: "deidentified",
        filters: F,
      }),
    ])
      expect(key[0]).toBe(ANALYSIS_KEYS.all[0]);
  });

  it("with a hidden patient count, hides every number, zeros too, and every drill", () => {
    const few: AffectedOut = {
      updated_at: "2026-10-22T06:00:00.000Z",
      from: F.from,
      to: F.to,
      bucket: "week",
      patients: H,
      by_age: [
        { band: "0-17", patients: { ...S(0), drill: null } },
        { band: "80+", patients: { ...H, drill: null } },
      ],
      by_sex: [],
      by_setting: [],
      by_location: [],
      by_specialty: [
        { specialty: "Paediatrics", patients: { ...H, drill: null } },
      ],
    };
    const out = hideAllWhenFew<"affected">(few);
    expect(out.by_age.map((r) => r.patients)).toEqual([
      { ...H, drill: null },
      { ...H, drill: null },
    ]);
    expect(out.by_age[0]!.band).toBe("0-17");
    expect(out.by_specialty[0]!.specialty).toBe("Paediatrics");
    const many = { ...few, patients: S(40) };
    expect(hideAllWhenFew<"affected">(many)).toBe(many);
  });

  it("reads a view through the reader, failing closed", async () => {
    holder.client = createMockAnalysis({ delayMs: 0 });
    const qc = new QueryClient();
    const { result } = renderHook(() => useAnalysisView("affected", F), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.data?.status).toBe("ok"));
    vi.spyOn(holder.client, "getView").mockResolvedValue({} as never);
    await result.current.refetch();
    await waitFor(() =>
      expect(result.current.data).toEqual({ status: "failed" }),
    );
  });

  it("loads no patients for null, and keeps none once nothing shows them", async () => {
    holder.client = createMockAnalysis({ delayMs: 0 });
    const spy = vi.spyOn(holder.client, "listPatients");
    const qc = new QueryClient();
    renderHook(() => usePatients(null), { wrapper: wrapper(qc) });
    expect(spy).not.toHaveBeenCalled();

    const q = {
      drill: "sex-female",
      level: "deidentified" as const,
      filters: F,
    };
    const { result, unmount } = renderHook(() => usePatients(q), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.data?.status).toBe("ok"));
    expect(qc.getQueryData(ANALYSIS_KEYS.patients(q))).toBeDefined();
    unmount();
    await waitFor(() =>
      expect(
        qc.getQueryCache().find({ queryKey: ANALYSIS_KEYS.patients(q) }),
      ).toBeUndefined(),
    );
  });
});
