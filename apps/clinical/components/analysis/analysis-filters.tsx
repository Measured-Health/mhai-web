"use client";
import { OctagonAlert, SlidersHorizontal, WifiOff } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type {
  AgeBand,
  AnalysisFilters,
  FilterOptionsOut,
  PeriodLevel,
  PeriodRef,
  Setting,
  Sex,
} from "@/lib/api/analysis-contract";
import {
  AGE_LABEL,
  SETTING_LABEL,
  SEX_LABEL,
  locationText,
  specialtyText,
} from "@/lib/analysis/labels";
import {
  CAP_REASON,
  FILTER_CAP,
  LOCATION_OR_SETTING,
  activeCount,
  filterBlocked,
  levelsOf,
  periodsOf,
  showSource,
  type FilterKey,
} from "@/lib/analysis/filters";
import { LEVEL_LABEL, periodLabel } from "@/lib/analysis/periods";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Sheet } from "@mhai/ui/sheet";
import { ConditionSearch } from "./condition-search";

export const OFFLINE_FILTERS =
  "You're offline. Reconnect to change the filters.";
export const FILTERS_FAILED = "Couldn't load the filters";

const control =
  "min-h-11 w-full rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep disabled:opacity-40";

/** The filter options: loaded, still loading, or failed. */
export type OptionsState =
  | { status: "ok"; data: FilterOptionsOut }
  | { status: "loading" }
  | { status: "failed" };

export const PERIOD_NOTE =
  "Finished weeks, months and quarters, one at a time.";

export type FiltersProps = {
  filters: AnalysisFilters;
  /** The answerable periods (core's list). */
  periods: FilterOptionsOut["periods"];
  /** The chosen period's filter lists. */
  options: OptionsState;
  online: boolean;
  onPeriod: (p: PeriodRef) => void;
  onChange: (patch: Partial<AnalysisFilters>) => void;
  onClear: () => void;
  onRetryOptions: () => void;
};

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-[12px] text-ink-3">
          {label}
        </label>
      ) : (
        <span aria-hidden className="text-[12px] text-ink-3">
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  all,
  choices,
  onChange,
  disabled,
  describedBy,
}: {
  label: string;
  value: T | null;
  all: string;
  choices: readonly { id: T; label: string }[];
  onChange: (v: T | null) => void;
  disabled: boolean;
  describedBy?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : (e.target.value as T))
        }
        className={control}
      >
        <option value="">{all}</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

const entries = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((id) => ({ id, label: labels[id] }));

/** The filter controls themselves, laid out inline or in the phone sheet. */
function FilterFields({
  filters,
  periods,
  options,
  online,
  onPeriod,
  onChange,
  onClear,
  onRetryOptions,
  stacked,
}: FiltersProps & { stacked: boolean }) {
  const levelId = useId();
  const periodId = useId();
  const periodNoteId = useId();
  const capId = useId();
  const bothId = useId();
  const reasonId = useId();
  const o = options.status === "ok" ? options.data : null;
  // Offline, nothing changes; with no lists, only the period does (spec §states).
  const periodOff = !online;
  const restOff = !online || !o;
  const reason = !online
    ? OFFLINE_FILTERS
    : options.status === "failed"
      ? FILTERS_FAILED
      : options.status === "loading"
        ? "Loading the filters…"
        : null;
  const level = filters.period.level;
  const levels = levelsOf(periods);
  const choices = periodsOf(periods, level);
  const periodDescribed = [periodNoteId, periodOff && reasonId]
    .filter(Boolean)
    .join(" ");
  const full = activeCount(filters) >= FILTER_CAP;
  const both =
    !full && (filters.location !== null) !== (filters.setting !== null);
  /** Off while offline or listless, or when core would refuse it (a third filter, or both places). */
  const off = (k: FilterKey) => restOff || filterBlocked(filters, k) !== null;
  const described = (k: FilterKey) => {
    const why = filterBlocked(filters, k);
    return (
      [
        reason && reasonId,
        why === CAP_REASON && capId,
        why === LOCATION_OR_SETTING && bothId,
      ]
        .filter(Boolean)
        .join(" ") || undefined
    );
  };
  function onLevel(l: PeriodLevel) {
    const latest = periodsOf(periods, l)[0];
    if (latest) onPeriod(latest);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "grid gap-3",
          stacked ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        <Field label="Period type" htmlFor={levelId}>
          <select
            id={levelId}
            value={level}
            disabled={periodOff}
            aria-describedby={periodDescribed}
            onChange={(e) => onLevel(e.target.value as PeriodLevel)}
            className={control}
          >
            {levels.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABEL[l]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Period" htmlFor={periodId}>
          <select
            id={periodId}
            value={filters.period.start}
            disabled={periodOff}
            aria-describedby={periodDescribed}
            onChange={(e) => onPeriod({ level, start: e.target.value })}
            className={control}
          >
            {choices.map((p) => (
              <option key={p.start} value={p.start}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Condition" className={stacked ? "" : "col-span-2"}>
          <ConditionSearch
            conditions={o?.conditions ?? []}
            value={filters.condition}
            onChange={(condition) => onChange({ condition })}
            disabled={off("condition")}
            describedBy={described("condition")}
          />
        </Field>
        <Select<AgeBand>
          label="Age band"
          value={filters.age_band}
          all="All ages"
          choices={entries(AGE_LABEL)}
          onChange={(age_band) => onChange({ age_band })}
          disabled={off("age_band")}
          describedBy={described("age_band")}
        />
        <Select<Sex>
          label="Sex"
          value={filters.sex}
          all="All"
          choices={entries(SEX_LABEL)}
          onChange={(sex) => onChange({ sex })}
          disabled={off("sex")}
          describedBy={described("sex")}
        />
        <Select<string>
          label="Ward or clinic"
          value={filters.location}
          all="All wards and clinics"
          choices={(o?.locations ?? []).map((l) => ({
            id: l.id,
            label: locationText(l),
          }))}
          onChange={(location) => onChange({ location })}
          disabled={off("location")}
          describedBy={described("location")}
        />
        <Select<Setting>
          label="Location type"
          value={filters.setting}
          all="All location types"
          choices={entries(SETTING_LABEL)}
          onChange={(setting) => onChange({ setting })}
          disabled={off("setting")}
          describedBy={described("setting")}
        />
        <Select<string>
          label="Specialty"
          value={filters.specialty}
          all="All specialties"
          choices={(o?.specialties ?? []).map((s) => ({
            id: s,
            label: specialtyText(s),
          }))}
          onChange={(specialty) => onChange({ specialty })}
          disabled={off("specialty")}
          describedBy={described("specialty")}
        />
        {o && showSource(o) && (
          <Select<string>
            label="Source"
            value={filters.source}
            all="All sources"
            choices={o.sources.map((s) => ({ id: s.id, label: s.label }))}
            onChange={(source) => onChange({ source })}
            disabled={off("source")}
            describedBy={described("source")}
          />
        )}
      </div>
      <p id={periodNoteId} className="text-[12px] text-ink-3">
        {PERIOD_NOTE}
      </p>
      {full && (
        <p id={capId} className="text-[12.5px] text-ink-2">
          {CAP_REASON}
        </p>
      )}
      {both && (
        <p id={bothId} className="text-[12.5px] text-ink-2">
          {LOCATION_OR_SETTING}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {reason && (
          <p
            id={reasonId}
            role={options.status === "failed" && online ? "alert" : undefined}
            className="flex flex-1 items-center gap-1.5 text-[12.5px] text-ink-2"
          >
            {!online ? (
              <WifiOff aria-hidden className="size-4 shrink-0" />
            ) : options.status === "failed" ? (
              <OctagonAlert
                aria-hidden
                className="size-4 shrink-0 text-bad-deep"
              />
            ) : null}
            {reason}
          </p>
        )}
        {online && options.status === "failed" && (
          <Button
            size="sm"
            variant="ghost"
            className="sm:min-h-11"
            onClick={onRetryOptions}
          >
            Try again
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto sm:min-h-11"
          disabled={restOff || activeCount(filters) === 0}
          onClick={onClear}
        >
          Clear filters
        </Button>
      </div>
    </div>
  );
}

/**
 * The Analysis filters: inline from `md`; on a phone, a "Filters ({n})"
 * button that opens them in a sheet. Nothing here touches the URL or storage.
 */
export function AnalysisFiltersBar(props: FiltersProps) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const noteId = useId();
  // On a phone, say why the filters are off before the sheet is opened.
  const note = !props.online
    ? OFFLINE_FILTERS
    : props.options.status === "failed"
      ? FILTERS_FAILED
      : null;
  if (desktop)
    return (
      <section aria-label="Filters" className="card-v3 px-4 py-4 md:px-5">
        <FilterFields {...props} stacked={false} />
      </section>
    );
  return (
    <>
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        aria-describedby={note ? noteId : undefined}
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filters ({activeCount(props.filters)})
      </Button>
      {note && (
        <p
          id={noteId}
          className="flex items-center gap-1.5 text-[12.5px] text-ink-2"
        >
          {props.online ? (
            <OctagonAlert
              aria-hidden
              className="size-4 shrink-0 text-bad-deep"
            />
          ) : (
            <WifiOff aria-hidden className="size-4 shrink-0" />
          )}
          {note}
        </p>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <h2 className="mb-3 text-[15px] font-semibold">Filters</h2>
        {open && <FilterFields {...props} stacked />}
      </Sheet>
    </>
  );
}
