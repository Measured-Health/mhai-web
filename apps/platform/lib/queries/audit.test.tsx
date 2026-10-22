import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import type { AuditRow } from "@/lib/audit/read";
import { auditEvent } from "@/tests/audit-event";
import { __resetReportedForTests, useReportUndisplayable } from "./audit";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    {children}
  </QueryClientProvider>
);

const bad = (n: number, from = 0): AuditRow[] =>
  Array.from({ length: n }, (_, i) => ({
    ok: false,
    id: `ev_${from + i}`,
    seq: from + i + 1,
  }));

let report: ReturnType<typeof vi.fn<PlatformClient["reportUndisplayable"]>>;
beforeEach(() => {
  __resetReportedForTests();
  report = vi.fn(async () => {});
  __setPlatformClientForTests({
    reportUndisplayable: report,
  } as unknown as PlatformClient);
});
afterEach(() => __resetPlatformClientForTests());

describe("useReportUndisplayable", () => {
  it("reports failed rows in batches of at most 50, each id once per tab", async () => {
    const rows: AuditRow[] = [
      { ok: true, event: auditEvent() },
      ...bad(120),
      { ok: false, id: null, seq: 7 },
    ];
    const { rerender, unmount } = renderHook(
      ({ r }) => useReportUndisplayable(r),
      { wrapper, initialProps: { r: rows } },
    );
    await waitFor(() => expect(report).toHaveBeenCalledTimes(3));
    expect(report.mock.calls.map(([ids]) => ids.length)).toEqual([50, 50, 20]);
    expect(new Set(report.mock.calls.flatMap(([ids]) => ids)).size).toBe(120);
    for (const [, opts] of report.mock.calls)
      expect(opts.idempotencyKey).toEqual(expect.any(String));

    rerender({ r: [...rows] });
    unmount();
    renderHook(() => useReportUndisplayable([...bad(3, 118)]), { wrapper });
    await waitFor(() => expect(report).toHaveBeenCalledTimes(4));
    expect(report.mock.calls[3]![0]).toEqual(["ev_120"]);
  });

  it("ignores a failed report", async () => {
    report.mockRejectedValue(new Error("down"));
    renderHook(() => useReportUndisplayable(bad(2)), { wrapper });
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
  });
});
