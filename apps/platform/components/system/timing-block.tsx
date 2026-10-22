import { answerTimeLine, type TimingValue } from "@/lib/ops/health";
import { stepLabel } from "@/lib/ops/labels";

const PERIODS = [
  ["last_hour", "Last hour"],
  ["last_24h", "Last 24 hours"],
] as const;

/** How long answers take: overall, then each step. */
export function TimingBlock({ value }: { value: TimingValue }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PERIODS.map(([k, title]) => (
        <div key={k}>
          <h3 className="text-[14px] font-semibold">{title}</h3>
          <p className="mt-1 text-[14px]">{answerTimeLine(value[k].overall)}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink-2">
            {value[k].steps.map((s) => (
              <li key={s.step}>
                <span className="font-semibold text-ink">
                  {stepLabel[s.step]}
                </span>
                <br />
                {answerTimeLine(s)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
