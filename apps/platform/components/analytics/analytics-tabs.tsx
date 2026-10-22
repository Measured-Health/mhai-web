"use client";
import {
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { Person } from "@/lib/api/contract";
import { AREA_TITLE, type AnalyticsState } from "@/lib/analytics/read";
import { cn } from "@mhai/ui/cn";
import { AlertsTab } from "./alerts-tab";
import { HospitalsTab } from "./hospitals-tab";
import { QualityTab } from "./quality-tab";
import { UseTab } from "./use-tab";

const TABS = ["use", "alerts", "quality", "hospitals"] as const;
type TabKey = (typeof TABS)[number];

/**
 * Use, Alert safety, Answer quality and Hospitals, below the two columns.
 * A tablist with arrow-key movement (Home and End too), opening on Use.
 * Each tab has its own Updated line and its own Couldn't load.
 */
export function AnalyticsTabs({
  state,
  failed,
  onRetry,
  pickedHospitalId,
  onPickHospital,
  rowRefs,
}: {
  state: AnalyticsState | null;
  /** The whole request failed with nothing to show. */
  failed: boolean;
  onRetry(): void;
  pickedHospitalId: string | null;
  onPickHospital(hospital: Person): void;
  /** The Hospitals rows' buttons by hospital id, so Back can refocus one. */
  rowRefs: RefObject<Map<string, HTMLButtonElement>>;
}) {
  const [tab, setTab] = useState<TabKey>("use");
  const base = useId();
  const refs = useRef(new Map<TabKey, HTMLButtonElement>());

  function move(e: KeyboardEvent, i: number) {
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (i + TABS.length - 1) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = TABS[to]!;
    setTab(next);
    refs.current.get(next)?.focus();
  }

  const common = { failed, onRetry };
  return (
    <div className="card-v3 px-[22px] py-5">
      <div
        role="tablist"
        aria-label="Analytics areas"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((k, i) => (
          <button
            key={k}
            ref={(el) => {
              if (el) refs.current.set(k, el);
              else refs.current.delete(k);
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${k}`}
            aria-selected={tab === k}
            aria-controls={tab === k ? `${base}-panel` : undefined}
            tabIndex={tab === k ? 0 : -1}
            onClick={() => setTab(k)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "min-h-11 shrink-0 border-b-2 px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
              tab === k
                ? "border-mint-deep text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {AREA_TITLE[k]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-2 focus-visible:outline-mint-deep"
      >
        {tab === "use" ? (
          <UseTab state={state?.use ?? null} {...common} />
        ) : tab === "alerts" ? (
          <AlertsTab state={state?.alerts ?? null} {...common} />
        ) : tab === "quality" ? (
          <QualityTab state={state?.quality ?? null} {...common} />
        ) : (
          <HospitalsTab
            state={state}
            {...common}
            pickedId={pickedHospitalId}
            onPick={onPickHospital}
            rowRefs={rowRefs}
          />
        )}
      </div>
    </div>
  );
}
