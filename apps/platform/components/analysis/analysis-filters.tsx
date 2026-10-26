"use client";
import { SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type {
  AnalysisQuery,
  FilterKey,
  FilterOptionsOut,
  Setting,
  Sex,
} from "@/lib/api/analysis-contract";
import {
  AGE_BANDS,
  activeCount,
  atLimit,
  limitText,
  showSource,
} from "@/lib/analysis/filters";
import { AGE_LABEL, SETTING_LABEL, SEX_LABEL } from "@/lib/analysis/labels";
import type { ViewState } from "@/lib/analysis/read";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Sheet } from "@mhai/ui/sheet";
import { OfflineNote } from "../states/offline-strip";
import { ConditionSearch } from "./condition-search";

type Props = {
  query: AnalysisQuery;
  options: ViewState<FilterOptionsOut> | undefined;
  onSet(key: FilterKey, value: string | null): void;
  onClear(): void;
  onRetryOptions(): void;
  offline: boolean;
};

/**
 * The filters: condition, age band (the scope's bands), sex, setting and
 * specialty; for One hospital also ward or clinic, and Source where the
 * hospital has more than one. At the limit the unset ones disable, with
 * the reason. On a phone they open in a sheet from "Filters ({n})".
 */
export function AnalysisFilters(props: Props) {
  const desktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const n = activeCount(props.query);
  if (desktop)
    return (
      <section
        aria-label="Filters"
        className="rounded-2xl border border-line bg-white p-4"
      >
        <Controls {...props} />
      </section>
    );
  return (
    <>
      <Button
        variant="ghost"
        className="self-start"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filters ({n})
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <h2 className="mb-3 text-[15px] font-semibold">Filters</h2>
        <Controls {...props} />
        <Button className="mt-4 w-full" onClick={() => setOpen(false)}>
          Done
        </Button>
      </Sheet>
    </>
  );
}

function Controls({
  query,
  options,
  onSet,
  onClear,
  onRetryOptions,
  offline,
}: Props) {
  const id = useId();
  const limitId = `${id}-limit`;
  const offlineId = `${id}-offline`;
  const full = atLimit(query);
  const opts = options?.status === "ok" ? options.data : null;
  const off = (key: FilterKey) => offline || (full && query[key] === null);
  const why = (key: FilterKey) =>
    offline ? offlineId : full && query[key] === null ? limitId : undefined;
  const field = (
    key: FilterKey,
    label: string,
    any: string,
    choices: readonly { value: string; label: string }[],
  ) => (
    <Field key={key} label={label}>
      {(fid) => (
        <select
          id={fid}
          value={query[key] ?? ""}
          disabled={off(key)}
          aria-describedby={why(key)}
          onChange={(e) => onSet(key, e.target.value || null)}
          className={inputClass}
        >
          <option value="">{any}</option>
          {choices.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
  const one = query.scope === "hospital";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ConditionSearch
          conditions={opts?.conditions ?? []}
          value={query.condition}
          onChange={(v) => onSet("condition", v)}
          disabled={off("condition")}
          describedBy={why("condition")}
        />
        {field(
          "age_band",
          "Age band",
          "Any age",
          AGE_BANDS[query.scope].map((b) => ({
            value: b,
            label: AGE_LABEL[b],
          })),
        )}
        {field(
          "sex",
          "Sex",
          "Any sex",
          (Object.keys(SEX_LABEL) as Sex[]).map((s) => ({
            value: s,
            label: SEX_LABEL[s],
          })),
        )}
        {field(
          "setting",
          "Setting",
          "Any setting",
          (Object.keys(SETTING_LABEL) as Setting[]).map((s) => ({
            value: s,
            label: SETTING_LABEL[s],
          })),
        )}
        {field(
          "specialty",
          "Specialty",
          "Any specialty",
          (opts?.specialties ?? []).map((s) => ({ value: s, label: s })),
        )}
        {one &&
          field(
            "location",
            "Ward or clinic",
            "Any ward or clinic",
            (opts?.locations ?? []).map((l) => ({
              value: l.id,
              label: l.label,
            })),
          )}
        {one &&
          opts &&
          showSource(opts) &&
          field(
            "source",
            "Source",
            "Any source",
            opts.sources.map((s) => ({ value: s.id, label: s.label })),
          )}
      </div>
      {options?.status === "failed" && (
        <p className="text-[13px] text-ink-3">
          Couldn&apos;t load the condition and specialty choices.{" "}
          <button
            type="button"
            onClick={onRetryOptions}
            className="min-h-11 font-semibold text-mint-deep underline"
          >
            Try again
          </button>
        </p>
      )}
      {full && (
        <p id={limitId} className="text-[13px] text-ink-2">
          {limitText(query.scope)}
        </p>
      )}
      <div id={offlineId}>
        <OfflineNote id={`${offlineId}-note`} />
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        disabled={offline || activeCount(query) === 0}
        onClick={onClear}
      >
        Clear filters
      </Button>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[12.5px] font-semibold text-ink-2">
        {label}
      </label>
      {children(id)}
    </div>
  );
}
