"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { ResultView } from "@/lib/result-view";
import { Sheet } from "../ui/sheet";
import { cn } from "../ui/cn";
import {
  ConfidenceBars,
  EvidencePanel,
  hasConfidenceBreakdown,
  SafetyChecks,
  SourceCards,
} from "./evidence-panel";

type Tab = "Checks" | "Why this confidence" | "Sources";

/** Side column at lg and up; below that, a summary bar that opens a tabbed sheet. */
export function EvidenceDock({
  view,
  open = true,
}: {
  view: ResultView;
  open?: boolean;
}) {
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<Tab>("Checks");
  const id = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs: Tab[] = hasConfidenceBreakdown(view)
    ? ["Checks", "Why this confidence", "Sources"]
    : ["Checks", "Sources"];
  const tab = tabs.includes(picked) ? picked : "Checks";

  const { verified, total } = view.claims;
  // A review result never shows a green all-clear, even if every claim passed.
  const ok = view.kind !== "review" && total > 0 && verified === total;
  const n = view.sources.length;

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.length - 1
          : step
            ? (i + step + tabs.length) % tabs.length
            : -1;
    if (to < 0) return;
    e.preventDefault();
    setPicked(tabs[to]);
    tabRefs.current[to]?.focus();
  };

  return (
    <>
      <aside
        aria-label="Evidence and safety"
        className={cn(
          "hidden overflow-auto border-l border-line bg-white/95 p-5 lg:block",
          !open && "lg:hidden",
        )}
      >
        <EvidencePanel view={view} />
      </aside>
      <button
        type="button"
        onClick={() => setSheet(true)}
        className="fixed inset-x-4 bottom-[88px] z-20 flex min-h-11 items-center gap-3 rounded-[18px] border border-line bg-white/95 px-3.5 py-3 text-left text-[13px] shadow-[0_24px_50px_-28px_rgb(70_3_81/.4)] backdrop-blur md:bottom-5 lg:hidden"
      >
        <span
          aria-hidden
          data-tone={ok ? "ok" : "warn"}
          className={cn(
            "grid size-[26px] place-items-center rounded-lg",
            ok ? "bg-ok-wash text-ok" : "bg-warn-wash text-warn",
          )}
        >
          {ok ? (
            <Check className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
        </span>
        <span>
          <b>Evidence &amp; safety</b>
          <small className="block text-xs text-ink-3">
            {total === 0
              ? "No claims checked"
              : `${verified} of ${total} claims verified`}
            {n > 0 && ` · ${n === 1 ? "1 source" : `${n} sources`}`}
          </small>
        </span>
        <span aria-hidden className="ml-auto font-semibold text-mint-deep">
          View ↑
        </span>
      </button>
      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Evidence and safety"
      >
        <div role="tablist" aria-label="Evidence" className="mb-3 flex gap-1.5">
          {tabs.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={tab === t}
              aria-controls={`${id}-panel`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setPicked(t)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "min-h-11 rounded-full px-3 py-1.5 text-[13px]",
                tab === t ? "bg-ink text-white" : "bg-lilac text-ink-2",
              )}
            >
              {t}
              {t === "Sources" && ` · ${n}`}
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`${id}-panel`}
          aria-labelledby={`${id}-tab-${tabs.indexOf(tab)}`}
        >
          {tab === "Checks" && <SafetyChecks view={view} />}
          {tab === "Why this confidence" && <ConfidenceBars view={view} />}
          {tab === "Sources" && <SourceCards view={view} />}
        </div>
      </Sheet>
    </>
  );
}
