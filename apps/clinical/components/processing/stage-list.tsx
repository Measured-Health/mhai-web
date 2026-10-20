import { Check } from "lucide-react";
import type { Stage } from "@/lib/api/contract";
import { STAGES, stageIndex } from "@/lib/labels";
import { cn } from "../ui/cn";

export function StageList({ stage }: { stage: Stage | null }) {
  const current = stageIndex(stage);
  return (
    <ol className="flex flex-col gap-1.5 text-left">
      {STAGES.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li
            key={s.id}
            data-state={state}
            aria-current={state === "active" ? "step" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[14px] border px-3.5 py-2.5 text-sm transition-colors duration-[var(--t-base)]",
              state === "done" &&
                "border-transparent bg-mint-wash text-mint-deep",
              state === "active" &&
                "border-mint bg-white font-semibold shadow-[0_0_0_4px_#15999e1a]",
              state === "todo" && "border-line bg-white text-ink-3",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-transform duration-[var(--t-base)] ease-[var(--e-spring)]",
                state === "done"
                  ? "scale-105 border-mint bg-mint text-white"
                  : state === "active"
                    ? "border-mint"
                    : "border-lilac-2",
              )}
            >
              {state === "done" && (
                <Check className="size-3.5" strokeWidth={3} />
              )}
              {/* The live dot's 1.2 s loop is exempt from the motion-token rule (spec S:127). */}
              {state === "active" && (
                <span className="size-2 rounded-full bg-mint motion-safe:animate-[pulse-dot_1.2s_ease-in-out_infinite]" />
              )}
            </span>
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
