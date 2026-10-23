import { pausedLine } from "@/lib/settings/labels";
import { TRIAGE_LABEL, partLabel, statusWords } from "@/lib/ops/labels";
import { timeLabel, type PartsValue } from "@/lib/ops/health";
import { StatusMark } from "./overall-status";

/** One row per part: the words, with an icon, and since when. */
export function PartsList({ value, now }: { value: PartsValue; now: number }) {
  const { parts, triage, cleanUp } = value;
  return (
    <ul aria-label="Parts of the system" className="divide-y divide-line">
      {parts.map((p) => (
        <li key={p.key} className="py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <StatusMark status={p.status} className="text-[14px] font-semibold">
              {`${partLabel[p.key]} · ${statusWords[p.status]}`}
            </StatusMark>
            <span className="text-[13px] text-ink-3">
              since {timeLabel(p.since, now)}
            </span>
          </div>
          {p.key === "clean_up" && (
            <div className="mt-1 pl-7 text-[13px] text-ink-2">
              <p>
                {cleanUp.last_run_at
                  ? `Last run ${timeLabel(cleanUp.last_run_at, now)}${
                      cleanUp.ok === true
                        ? " · finished"
                        : cleanUp.ok === false
                          ? " · didn't finish"
                          : ""
                    }`
                  : "Hasn't run yet"}
              </p>
              {cleanUp.paused && (
                <p>{pausedLine(cleanUp.paused_by, cleanUp.paused_at)}</p>
              )}
            </div>
          )}
        </li>
      ))}
      <li className="py-2.5 text-[14px] font-semibold">
        {`${TRIAGE_LABEL} · ${triage.enabled ? "On" : "Off"}`}
      </li>
    </ul>
  );
}
