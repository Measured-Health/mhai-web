import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import {
  TooManyRowsError,
  type ExportIn,
  type ExportOut,
} from "@/lib/api/audit-contract";
import type { PlatformClient } from "@/lib/api/contract";
import { ApiError } from "@mhai/api-client/errors";
import type { AuditRow } from "@/lib/audit/read";
import { auditEvent } from "@/tests/audit-event";
import {
  __resetReportedForTests,
  useCreateExport,
  useReportUndisplayable,
} from "./audit";

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

describe("useCreateExport", () => {
  const BODY: ExportIn = {
    kind: "events",
    filters: {},
    reason: "legal_request",
    mfa_code: "424242",
  };
  const OUT: ExportOut = {
    export_id: "exp_1",
    rows: 3,
    capped: false,
    checksum: "a".repeat(64),
    expires_at: "2026-10-22T10:00:00.000Z",
    file_name: "audit-events-exp_1-20261022-0945Z.csv",
  };

  function setup(answer: () => Promise<ExportOut>) {
    const createExport = vi.fn(answer);
    __setPlatformClientForTests({ createExport } as unknown as PlatformClient);
    const qc = new QueryClient();
    const hook = renderHook(() => useCreateExport(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    const leaked = () =>
      JSON.stringify(
        qc
          .getMutationCache()
          .getAll()
          .map((m) => m.state.variables),
      );
    return { hook, leaked, createExport };
  }

  it("forgets the code after a success and hands the reply on, with a key", async () => {
    const { hook, leaked, createExport } = setup(async () => OUT);
    let got: ExportOut | null = null;
    act(() => hook.result.current.run(BODY, { onSuccess: (r) => (got = r) }));
    await waitFor(() => expect(got).toEqual(OUT));
    expect(createExport).toHaveBeenCalledWith(BODY, {
      idempotencyKey: expect.any(String),
    });
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.error).toBeNull();
    expect(leaked()).not.toContain("424242");
  });

  it("forgets the code after a refusal and keeps the refusal to show", async () => {
    const { hook, leaked } = setup(async () => {
      throw new ApiError(403, "mfa_invalid");
    });
    act(() => hook.result.current.run(BODY));
    await waitFor(() =>
      expect(hook.result.current.error).toBeInstanceOf(ApiError),
    );
    expect(leaked()).not.toContain("424242");
    act(() => hook.result.current.clear());
    expect(hook.result.current.error).toBeNull();
  });

  it("a refusal the caller handles is not kept, and the code is forgotten", async () => {
    const { hook, leaked } = setup(async () => {
      throw new TooManyRowsError(62_310);
    });
    let rows = 0;
    act(() =>
      hook.result.current.run(BODY, {
        onError: (e) => {
          if (!(e instanceof TooManyRowsError)) return false;
          rows = e.rows;
          return true;
        },
      }),
    );
    await waitFor(() => expect(rows).toBe(62_310));
    expect(hook.result.current.error).toBeNull();
    expect(leaked()).not.toContain("424242");
  });
});
