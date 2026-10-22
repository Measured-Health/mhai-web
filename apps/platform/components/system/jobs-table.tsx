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

const HEAD = [
  "What",
  "Hospital",
  "Failed",
  "First tried",
  "Attempts",
  "Why",
  "Reference",
  "Status",
];

/** The failed jobs as a table, on wide screens. */
export function JobsTable({
  rows,
  canChoose,
  chosen,
  onToggle,
  onCopy,
}: JobListProps) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">Jobs</caption>
        <thead>
          <tr className="border-b border-line text-[12px] text-ink-3">
            {canChoose && (
              <th scope="col" className="w-10 px-3 py-2">
                <span className="sr-only">Choose</span>
              </th>
            )}
            {HEAD.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((j) => (
            <tr key={j.id}>
              {canChoose && (
                <td className="px-3 py-2">
                  {j.status === "failed" && (
                    <Choose
                      job={j}
                      chosen={chosen.has(j.id)}
                      onToggle={onToggle}
                    />
                  )}
                </td>
              )}
              <td className="px-3 py-2 font-semibold">{whatLabel(j)}</td>
              <td className="px-3 py-2">{hospitalLabel(j)}</td>
              <td className="px-3 py-2">
                <time dateTime={j.failed_at}>{when(j.failed_at)}</time>
              </td>
              <td className="px-3 py-2">
                <time dateTime={j.created_at}>{when(j.created_at)}</time>
              </td>
              <td className="px-3 py-2">{j.attempts}</td>
              <td className="px-3 py-2">{whyLabel(j)}</td>
              <td className="px-3 py-2">
                <Reference job={j} onCopy={onCopy} />
              </td>
              <td className="px-3 py-2">
                <JobStatusChip job={j} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
