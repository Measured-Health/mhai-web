import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AnalysisClient } from "./api/analysis";
import type { AffectedOut } from "./api/analysis-contract";
import { ApiError } from "./api/errors";
import { createMockAnalysis } from "./api/mock-analysis";
import { emptyFilters } from "./analysis/filters";

const holder = vi.hoisted(() => ({
  client: null as unknown as AnalysisClient,
}));
vi.mock("./api/analysis", () => ({ getAnalysisClient: () => holder.client }));
import {
  ANALYSIS_KEYS,
  frameState,
  hideAllWhenFew,
  useAnalysisView,
  usePatients,
} from "./analysis-queries";

const F = emptyFilters({ level: "quarter", start: "2026-07-01" });
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
      ANALYSIS_KEYS.filters(null),
      ANALYSIS_KEYS.filters(F.period),
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
      from: "2026-07-01",
      to: "2026-09-30",
      bucket: "month",
      patients: H,
      period: F.period,
      history: [
        { start: "2026-04-01", cases: S(9), new: S(0), patients: S(9) },
      ],
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
    // Earlier periods are hidden too: nothing beside so few patients.
    expect(out.history[0]!.cases).toEqual(H);
    expect(out.history[0]!.start).toBe("2026-04-01");
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

  it("asks nothing without filters, and maps refusals to plain states", async () => {
    holder.client = createMockAnalysis({ delayMs: 0 });
    const spy = vi
      .spyOn(holder.client, "getView")
      .mockRejectedValue(new ApiError(503, "not_ready"));
    const qc = new QueryClient();
    renderHook(() => useAnalysisView("affected", null), {
      wrapper: wrapper(qc),
    });
    expect(spy).not.toHaveBeenCalled();
    const { result } = renderHook(() => useAnalysisView("affected", F), {
      wrapper: wrapper(qc),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    // Shown at once, not retried.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(frameState(result.current)).toEqual({
      status: "problem",
      problem: { kind: "not_ready" },
    });
    spy.mockRejectedValue(new ApiError(404, "not_found"));
    await result.current.refetch();
    await waitFor(() =>
      expect(frameState(result.current)).toEqual({
        status: "problem",
        problem: { kind: "off" },
      }),
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
