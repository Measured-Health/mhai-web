"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { useOnline } from "@mhai/ui/hooks/use-online";
import { getPlatformClient } from "@/lib/api/client";
import type {
  AuditFilters,
  AuditHospital,
  AuditList,
  AuditPerson,
  IntegrityStatus,
  VerifyRun,
} from "@/lib/api/audit-contract";
import { isRunning } from "@/lib/audit/integrity";
import { ROLE_WORDS } from "@/lib/audit/kinds";
import {
  ID,
  readAuditList,
  readDetail,
  readRun,
  readRunList,
  readStatus,
  type AuditRow,
  type ReadRun,
  type ReadStatus,
} from "@/lib/audit/read";
import { queryKeys } from "./keys";
import { POLL_MS, useTabVisible } from "./notifications";

/** While a check runs, its status is read this often. */
export const RUNNING_POLL_MS = 2_000;
/** The most ids one report may carry. */
const REPORT_MAX = 50;

const auditKey = queryKeys.audit;

const statusKey = [...auditKey, "status"] as const;
const runsKey = [...auditKey, "runs"] as const;
const runKey = (id: string | null) => [...auditKey, "run", id] as const;

type ReadList = ReturnType<typeof readAuditList>;
const readPages = (
  d: InfiniteData<AuditList, string | null>,
): InfiniteData<ReadList, string | null> => ({
  pages: d.pages.map(readAuditList),
  pageParams: d.pageParams,
});

/**
 * The events for one filter set, newest first, 50 a page. Each page is read
 * strictly (a bad envelope fails the query). A new filter set is a new key,
 * so a Load more still in flight for the old set is dropped. Recording the
 * read is the server's job; Load more sends only the cursor.
 */
export function useAuditEvents(f: AuditFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...auditKey, "events", f] as const,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listAudit(f, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    select: readPages,
    refetchOnMount: "always",
    // A search may be for a patient's pseudonym: not kept once off screen.
    ...(f.q ? { gcTime: 0 } : {}),
    enabled,
  });
}

/**
 * One entry in full. Opening it is a recorded read, so it is fetched when it
 * opens and not again on focus or reconnect.
 */
export function useAuditEvent(id: string | null) {
  return useQuery({
    queryKey: [...auditKey, "event", id] as const,
    queryFn: () => getPlatformClient().getAuditEvent(id as string),
    select: readDetail,
    enabled: id !== null,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const isText = (v: unknown, max: number): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= max &&
  !/[\p{Cc}\p{Cf}]/u.test(v);
/** A person the picker can show; anyone else is left out. */
const personOk = (p: AuditPerson): boolean =>
  typeof p === "object" &&
  p !== null &&
  typeof p.id === "string" &&
  ID.test(p.id) &&
  isText(p.name, 120) &&
  isText(p.email, 254) &&
  Object.hasOwn(ROLE_WORDS, p.role) &&
  (p.hospital === null ||
    (typeof p.hospital === "object" && isText(p.hospital?.name, 120)));
const readPeople = (r: { people: AuditPerson[] }): AuditPerson[] =>
  Array.isArray(r?.people) ? r.people.filter(personOk) : [];

/** People to pick from, by name or email: from 2 characters, after a pause. */
export function useAuditPeople(q: string) {
  const term = useDebounced(q.trim(), 250);
  return useQuery({
    queryKey: [...auditKey, "people", term] as const,
    queryFn: () => getPlatformClient().searchAuditPeople(term),
    select: readPeople,
    enabled: term.length >= 2,
  });
}

const readHospitals = (r: { hospitals: AuditHospital[] }): AuditHospital[] =>
  Array.isArray(r?.hospitals)
    ? r.hospitals.filter(
        (h) =>
          typeof h === "object" &&
          h !== null &&
          typeof h.id === "string" &&
          ID.test(h.id) &&
          h.id !== "platform" &&
          isText(h.name, 120) &&
          typeof h.removed === "boolean",
      )
    : [];

/** Every hospital the log names, removed ones included. */
export function useAuditHospitals() {
  return useQuery({
    queryKey: [...auditKey, "hospitals"] as const,
    queryFn: () => getPlatformClient().listAuditHospitals(),
    select: readHospitals,
  });
}

function running(raw: IntegrityStatus | undefined): boolean {
  if (raw === undefined) return false;
  try {
    return isRunning(readStatus(raw));
  } catch {
    return false;
  }
}

/**
 * The integrity status: the header line, the footer's oldest date and the
 * banner. Read every minute while the tab shows and is online, every 2 s
 * while a check runs. The read is marked background, so it never keeps an
 * idle session alive.
 */
export function useIntegrityStatus() {
  const online = useOnline();
  const visible = useTabVisible();
  return useQuery<IntegrityStatus, Error, ReadStatus>({
    queryKey: statusKey,
    queryFn: () => getPlatformClient().getIntegrityStatus(),
    select: readStatus,
    refetchInterval: (query) =>
      visible && online
        ? running(query.state.data)
          ? RUNNING_POLL_MS
          : POLL_MS
        : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: visible,
  });
}

/** The checks, newest first, a page at a time. Each run is read strictly. */
export function useVerifyRuns() {
  return useInfiniteQuery({
    queryKey: runsKey,
    queryFn: async ({ pageParam }) =>
      readRunList(await getPlatformClient().listRuns(pageParam ?? undefined)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
}

const runningRaw = (raw: VerifyRun | undefined) =>
  raw !== undefined && readRun(raw).state === "running";

/**
 * One check, read every 2 s while it runs (only while the tab shows and is
 * online). The read is marked background, as the status is.
 */
export function useRun(id: string | null) {
  const online = useOnline();
  const visible = useTabVisible();
  return useQuery<VerifyRun, Error, ReadRun>({
    queryKey: runKey(id),
    queryFn: () => getPlatformClient().getRun(id!),
    select: readRun,
    enabled: id !== null,
    // A run that stops loading isn't polled on its last good read.
    refetchInterval: (query) =>
      visible &&
      online &&
      query.state.status !== "error" &&
      runningRaw(query.state.data)
        ? RUNNING_POLL_MS
        : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: visible,
  });
}

/** After a check starts or ends, or an outcome is added. */
export function useRefreshIntegrity() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: statusKey }),
        qc.invalidateQueries({ queryKey: runsKey }),
      ]),
    [qc],
  );
}

/**
 * Starts a check, or returns the one already running: one Idempotency-Key
 * per press. The run id is kept only when it reads as an id.
 */
export function useStartCheck() {
  const refresh = useRefreshIntegrity();
  return useKeyedMutation(
    async (_: void, key) => {
      const r = await getPlatformClient().startCheck({ idempotencyKey: key });
      return { run_id: ID.test(r?.run_id ?? "") ? r.run_id : null };
    },
    { onSuccess: () => void refresh() },
  );
}

/**
 * The auditor's outcome note on a failed check, sent with the run's
 * version: a 409 means someone else changed it first.
 */
export function useAddOutcome() {
  const refresh = useRefreshIntegrity();
  return useKeyedMutation(
    (v: { runId: string; note: string; version: number }, key) =>
      getPlatformClient().addOutcome(
        v.runId,
        { note: v.note, version: v.version },
        { idempotencyKey: key },
      ),
    { onSuccess: () => void refresh() },
  );
}

/** Ids already reported from this tab. */
const reported = new Set<string>();

export function __resetReportedForTests() {
  reported.clear();
}

/**
 * Tells the server about entries that can't be displayed: each id once per
 * tab, at most 50 a call. A failed report is ignored (the row still shows
 * as "can't be displayed").
 */
export function useReportUndisplayable(rows: AuditRow[]) {
  useEffect(() => {
    const fresh: string[] = [];
    for (const r of rows)
      if (!r.ok && r.id !== null && !reported.has(r.id)) {
        reported.add(r.id);
        fresh.push(r.id);
      }
    for (let i = 0; i < fresh.length; i += REPORT_MAX)
      getPlatformClient()
        .reportUndisplayable(fresh.slice(i, i + REPORT_MAX), {
          idempotencyKey: crypto.randomUUID(),
        })
        .catch(() => {});
  }, [rows]);
}
