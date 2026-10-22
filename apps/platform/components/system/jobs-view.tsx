"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  ERROR_KINDS,
  JOBS_MAX,
  JOB_STATUSES,
  JOB_TYPES,
  type ErrorKind,
  type Job,
  type JobQuery,
  type JobStatus,
  type JobType,
} from "@/lib/api/ops-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { isKnownJob } from "@/lib/ops/jobs";
import { errorKindLabel, jobStatusLabel, jobTypeLabel } from "@/lib/ops/labels";
import { useHospitalOptions } from "@/lib/queries/activity";
import { useJobs } from "@/lib/queries/ops";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useToast } from "@mhai/ui/toast";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { CancelJobsDialog } from "./cancel-jobs-dialog";
import { JobsCards } from "./jobs-cards";
import { JobsTable } from "./jobs-table";
import { RetryDialog } from "./retry-dialog";

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";
const TOO_MANY = "Choose up to 50 at a time.";

/** A filter value from the URL, or undefined when it is missing or unknown. */
const known = <T extends string>(v: string | null, all: readonly T[]) =>
  v && (all as readonly string[]).includes(v) ? (v as T) : undefined;

/** The failed jobs: filters in the URL, choose some, retry or cancel them. */
export function JobsView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const canChoose = isPlatformAdmin(user);
  const desktop = useIsDesktop();
  const toast = useToast();
  const net = useNeedsConnection("jobs-offline");

  const status = known<JobStatus | "all">(params.get("status"), [
    ...JOB_STATUSES,
    "all",
  ]);
  const what = known<JobType>(params.get("what"), JOB_TYPES);
  const why = known<ErrorKind>(params.get("why"), ERROR_KINDS);
  const hospital = params.get("hospital") || undefined;
  const filter: Omit<JobQuery, "cursor"> = {
    ...(status ? { status } : {}),
    ...(what ? { type: what } : {}),
    ...(why ? { kind: why } : {}),
    ...(hospital ? { hospital } : {}),
  };

  const options = useHospitalOptions();
  const q = useJobs(filter);
  const rows = q.data?.pages.flatMap((p) => p.jobs) ?? [];
  const bad = rows.some((j) => !isKnownJob(j));

  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [limit, setLimit] = useState(false);
  // The jobs are fixed when a dialog opens, so a refetch can't change them.
  const [dialog, setDialog] = useState<{
    kind: "retry" | "cancel";
    jobs: Job[];
  } | null>(null);
  // Only what is still shown and failed counts as chosen.
  const failed = rows.filter((j) => j.status === "failed");
  const chosenJobs = failed.filter((j) => picked.has(j.id));

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    setPicked(new Set());
    setLimit(false);
    const s = next.toString();
    router.replace(s ? `${pathname}?${s}` : pathname);
  };
  const toggle = (id: string) => {
    const next = new Set(chosenJobs.map((j) => j.id));
    if (next.has(id)) {
      next.delete(id);
      setLimit(false);
    } else if (next.size >= JOBS_MAX) {
      setLimit(true);
      return;
    } else next.add(id);
    setPicked(next);
  };
  const selectAll = () => {
    setLimit(failed.length > JOBS_MAX);
    setPicked(new Set(failed.slice(0, JOBS_MAX).map((j) => j.id)));
  };
  const clear = () => {
    setPicked(new Set());
    setLimit(false);
  };
  const copy = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.show({ title: "Reference copied", live: "polite" });
    } catch {
      toast.show({ title: "Couldn't copy the reference", live: "assertive" });
    }
  };

  const names = options.data ?? [];
  const unknownHospital =
    !!hospital && options.isSuccess && !names.some((h) => h.id === hospital);
  const List = desktop ? JobsTable : JobsCards;
  const filtered =
    !!(what || why || hospital) || (!!status && status !== "failed");

  const field = (
    label: string,
    key: string,
    value: string,
    opts: { value: string; label: string }[],
  ) => (
    <label className="flex items-center gap-2 text-[13px] text-ink-2">
      {label}
      <select
        value={value}
        onChange={(e) => set(key, e.target.value)}
        className={control}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {field(
          "Status",
          "status",
          status && status !== "failed" ? status : "",
          [
            { value: "", label: jobStatusLabel("failed") },
            ...JOB_STATUSES.filter((s) => s !== "failed").map((s) => ({
              value: s,
              label: jobStatusLabel(s),
            })),
            { value: "all", label: "All" },
          ],
        )}
        {field("What", "what", what ?? "", [
          { value: "", label: "All" },
          ...JOB_TYPES.map((t) => ({ value: t, label: jobTypeLabel(t) })),
        ])}
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Hospital
          <select
            value={hospital ?? ""}
            disabled={options.isPending}
            onChange={(e) => set("hospital", e.target.value)}
            className={control}
          >
            <option value="">
              {options.isPending ? "Loading hospitals…" : "All hospitals"}
            </option>
            {unknownHospital && (
              <option value={hospital}>Unknown hospital</option>
            )}
            {names.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {field("Why", "why", why ?? "", [
          { value: "", label: "All" },
          ...ERROR_KINDS.map((k) => ({ value: k, label: errorKindLabel(k) })),
        ])}
      </div>

      {canChoose && failed.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            Select all shown
          </Button>
          {chosenJobs.length > 0 && (
            <div
              role="group"
              aria-label="Chosen jobs"
              className="flex flex-wrap items-center gap-2"
            >
              <span role="status" className="text-[13.5px] font-semibold">
                {chosenJobs.length} chosen
              </span>
              <Button
                size="sm"
                {...net.props}
                onClick={() => setDialog({ kind: "retry", jobs: chosenJobs })}
              >
                Retry
              </Button>
              <Button
                size="sm"
                variant="danger"
                {...net.props}
                onClick={() => setDialog({ kind: "cancel", jobs: chosenJobs })}
              >
                Cancel jobs
              </Button>
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
            </div>
          )}
          {limit && (
            <p role="alert" className="text-[13px] text-bad">
              {TOO_MANY}
            </p>
          )}
        </div>
      )}
      {canChoose && chosenJobs.length > 0 && <OfflineNote id="jobs-offline" />}

      {(q.isError && !q.data) || bad ? (
        <CouldntLoad what="failed jobs" onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Loading label="Loading failed jobs" />
      ) : rows.length === 0 ? (
        <Empty title="No failed jobs">
          {filtered
            ? "Nothing matches these choices."
            : "Nothing needs attention."}
        </Empty>
      ) : (
        <List
          rows={rows}
          canChoose={canChoose}
          chosen={new Set(chosenJobs.map((j) => j.id))}
          onToggle={toggle}
          onCopy={(id) => void copy(id)}
        />
      )}

      {q.isError && q.data && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-lilac-2 bg-white px-4 py-3 text-[13.5px]"
        >
          <span>Couldn&apos;t refresh the jobs. Showing what was loaded.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              void (q.isFetchNextPageError ? q.fetchNextPage() : q.refetch())
            }
          >
            Try again
          </Button>
        </div>
      )}
      {q.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}

      {dialog?.kind === "retry" && (
        <RetryDialog
          jobs={dialog.jobs}
          onClose={() => setDialog(null)}
          onDone={clear}
        />
      )}
      {dialog?.kind === "cancel" && (
        <CancelJobsDialog
          jobs={dialog.jobs}
          onClose={() => setDialog(null)}
          onDone={clear}
        />
      )}
    </div>
  );
}
