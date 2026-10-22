import {
  Choose,
  JobStatusChip,
  Reference,
  hospitalLabel,
  when,
  whatLabel,
  whyLabel,
  type JobListProps,
} from "./job-parts";

/** The failed jobs as cards, on phones. */
export function JobsCards({
  rows,
  canChoose,
  chosen,
  onToggle,
  onCopy,
}: JobListProps) {
  return (
    <ul aria-label="Jobs" className="flex flex-col gap-3">
      {rows.map((j) => (
        <li key={j.id} className="card-v3 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {canChoose && j.status === "failed" && (
                <label className="grid size-11 shrink-0 place-items-center">
                  <Choose
                    job={j}
                    chosen={chosen.has(j.id)}
                    onToggle={onToggle}
                  />
                </label>
              )}
              <div className="min-w-0">
                <p className="font-semibold">{whatLabel(j)}</p>
                <p className="text-[12.5px] text-ink-3">{hospitalLabel(j)}</p>
              </div>
            </div>
            <JobStatusChip job={j} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
            <div>
              <dt className="text-ink-3">Failed</dt>
              <dd>{when(j.failed_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">First tried</dt>
              <dd>{when(j.created_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Attempts</dt>
              <dd>{j.attempts}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Why</dt>
              <dd>{whyLabel(j)}</dd>
            </div>
          </dl>
          <div className="mt-2 text-[12.5px]">
            <Reference job={j} onCopy={onCopy} />
          </div>
        </li>
      ))}
    </ul>
  );
}
