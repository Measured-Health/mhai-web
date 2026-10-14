import type { Stage } from "@/lib/api/contract";
import { STAGES, stageIndex } from "@/lib/labels";
import { EcgLine } from "./ecg-line";
import { StageList } from "./stage-list";

// Shows total elapsed time only. The API gives no per-stage timings (spec §10, item 12).
export function ProcessingView({
  stage,
  progress,
  elapsedMs,
}: {
  stage: Stage | null;
  progress: number;
  elapsedMs: number;
}) {
  const pct = Math.round(progress * 100);
  const step = stageIndex(stage) + 1;
  return (
    <section
      aria-live="polite"
      className="card-v3 mx-auto mt-5 max-w-[540px] p-6 text-center"
    >
      <EcgLine />
      <h2 className="font-display text-[34px] font-black leading-none">
        Analysing your question
      </h2>
      <p className="mb-[18px] mt-1 text-ink-2">
        Running clinical safety checks. This usually takes 10–20 seconds.
      </p>
      <StageList stage={stage} />
      <div
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-[18px] h-1.5 overflow-hidden rounded-full bg-lilac"
      >
        <i
          className="block h-full rounded-full bg-gradient-to-r from-mint to-mint-2 transition-[width] duration-[var(--t-slow)] ease-[var(--e-out)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-ink-3">
        <span>
          Step {step} of {STAGES.length}
        </span>
        <span className="font-mono tabular">
          {(elapsedMs / 1000).toFixed(1)} s
        </span>
      </div>
    </section>
  );
}
