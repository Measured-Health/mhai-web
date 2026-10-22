"use client";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  AUDIT_TYPES,
  type AuditFilters,
  type AuditHospital,
  type AuditPerson,
  type AuditType,
  type Outcome,
} from "@/lib/api/audit-contract";
import {
  DEFAULT_PRESET,
  checkCustomRange,
  rangeOf,
  type Preset,
} from "@/lib/audit/dates";
import { TYPE_WORDS } from "@/lib/audit/kinds";
import { ID } from "@/lib/audit/read";
import { OUTCOME_WORDS } from "@/lib/audit/words";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { PersonPicker } from "./person-picker";

/**
 * The Events tab's filters and search. Held by the audit view, so they
 * survive a tab switch; never in the URL or in storage.
 */
export type EventsState = {
  /** "" for all, "platform", or a hospital id. */
  hospital: string;
  person: AuditPerson | null;
  types: AuditType[];
  preset: Preset;
  /** The preset's range, fixed when it was chosen. */
  range: { from: string; to: string };
  /** The custom range's days, "YYYY-MM-DD". */
  fromDay: string;
  toDay: string;
  outcome: Outcome | "";
  flagged: boolean;
  /** The applied search. */
  q: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** The local day of an instant, "YYYY-MM-DD". */
function dayOf(ms: number): string {
  const t = new Date(ms);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}
/** A range's first and last local days ([from, to): `to` is excluded). */
const daysOf = (r: { from: string; to: string }) => ({
  fromDay: dayOf(Date.parse(r.from)),
  toDay: dayOf(Date.parse(r.to) - 1),
});

export function initialEvents(now: number): EventsState {
  const range = rangeOf(DEFAULT_PRESET as Exclude<Preset, "custom">, now);
  return {
    hospital: "",
    person: null,
    types: [],
    preset: DEFAULT_PRESET,
    range,
    ...daysOf(range),
    outcome: "",
    flagged: false,
    q: "",
  };
}

/** The filters to send, or why the dates can't be used. */
export function filtersOf(
  s: EventsState,
  now: number,
): { filters: AuditFilters } | { error: string } {
  const range =
    s.preset === "custom" ? checkCustomRange(s.fromDay, s.toDay, now) : s.range;
  if ("error" in range) return { error: range.error };
  const f: AuditFilters = {};
  if (s.hospital) f.hospital = s.hospital;
  if (s.person) f.person = s.person.id;
  if (s.types.length) f.type = AUDIT_TYPES.filter((t) => s.types.includes(t));
  if (s.outcome) f.outcome = s.outcome;
  if (s.flagged) f.flagged = true;
  f.from = range.from;
  f.to = range.to;
  if (s.q) f.q = s.q;
  return { filters: f };
}

const PRESETS: [Preset, string][] = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["12m", "Last 12 months"],
  ["custom", "Custom"],
];

const control =
  "min-h-11 rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep";
const labelClass = "text-[12px] font-semibold text-ink-2";
const SEARCH_INVALID = "Enter an exact id: letters, numbers, - and _ only.";

export function EventFilters({
  value,
  onChange,
  hospitals,
  rangeError,
}: {
  value: EventsState;
  onChange(next: EventsState): void;
  hospitals: AuditHospital[] | undefined;
  rangeError: string | null;
}) {
  const id = useId();
  const set = (p: Partial<EventsState>) => onChange({ ...value, ...p });

  function choosePreset(p: Preset) {
    if (p === "custom") {
      // Start from the range in use, whole days.
      const r = value.preset === "custom" ? null : daysOf(value.range);
      set({ preset: p, ...(r ?? {}) });
    } else set({ preset: p, range: rangeOf(p, Date.now()) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-h`} className={labelClass}>
            Hospital
          </label>
          <select
            id={`${id}-h`}
            value={value.hospital}
            onChange={(e) => set({ hospital: e.target.value })}
            className={control}
          >
            <option value="">All hospitals</option>
            <option value="platform">Platform only</option>
            {hospitals?.map((h) => (
              <option key={h.id} value={h.id}>
                {h.removed ? `${h.name} (removed)` : h.name}
              </option>
            ))}
          </select>
        </div>

        <PersonPicker
          value={value.person}
          onChange={(person) => set({ person })}
        />

        <ActionTypes value={value.types} onChange={(types) => set({ types })} />

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-d`} className={labelClass}>
            Dates
          </label>
          <select
            id={`${id}-d`}
            value={value.preset}
            onChange={(e) => choosePreset(e.target.value as Preset)}
            className={control}
          >
            {PRESETS.map(([p, words]) => (
              <option key={p} value={p}>
                {words}
              </option>
            ))}
          </select>
        </div>

        {value.preset === "custom" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-from`} className={labelClass}>
                From
              </label>
              <input
                id={`${id}-from`}
                type="date"
                value={value.fromDay}
                onChange={(e) => set({ fromDay: e.target.value })}
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeError ? `${id}-range` : undefined}
                className={control}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-to`} className={labelClass}>
                To
              </label>
              <input
                id={`${id}-to`}
                type="date"
                value={value.toDay}
                onChange={(e) => set({ toDay: e.target.value })}
                aria-invalid={rangeError ? true : undefined}
                aria-describedby={rangeError ? `${id}-range` : undefined}
                className={control}
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-o`} className={labelClass}>
            Outcome
          </label>
          <select
            id={`${id}-o`}
            value={value.outcome}
            onChange={(e) => set({ outcome: e.target.value as Outcome | "" })}
            className={control}
          >
            <option value="">All</option>
            {(Object.keys(OUTCOME_WORDS) as Outcome[]).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_WORDS[o]}
              </option>
            ))}
          </select>
        </div>

        <label className="flex min-h-11 items-center gap-2 text-[13.5px]">
          <input
            type="checkbox"
            checked={value.flagged}
            onChange={(e) => set({ flagged: e.target.checked })}
            className="size-4 accent-mint-deep"
          />
          Flagged only
        </label>
      </div>

      {rangeError && (
        <p id={`${id}-range`} role="alert" className="text-[13px] text-bad">
          {rangeError}
        </p>
      )}

      <SearchBox value={value.q} onApply={(q) => set({ q })} />
    </div>
  );
}

/** "Search by exact id": applies on Enter or Search, clears with Clear. */
function SearchBox({
  value,
  onApply,
}: {
  value: string;
  onApply(q: string): void;
}) {
  const id = useId();
  const net = useNeedsConnection(`${id}-offline`);
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (net.offline) return;
    const q = draft.trim();
    if (q && !ID.test(q)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(q);
    onApply(q);
  }
  function clear() {
    setDraft("");
    setInvalid(false);
    onApply("");
  }

  return (
    <form role="search" onSubmit={submit} className="flex flex-col gap-1">
      <label htmlFor={`${id}-q`} className={labelClass}>
        Search by exact id
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${id}-q`}
          type="search"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(false);
          }}
          placeholder="Event, request, export or clearance id, or a patient id"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-invalid` : undefined}
          className={cn(control, "min-w-0 flex-1 font-mono sm:min-w-[300px]")}
        />
        <Button type="submit" variant="soft" size="sm" {...net.props}>
          Search
        </Button>
        {(value || draft) && (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Clear search"
            onClick={clear}
          >
            Clear
          </Button>
        )}
      </div>
      {invalid && (
        <p id={`${id}-invalid`} role="alert" className="text-[13px] text-bad">
          {SEARCH_INVALID}
        </p>
      )}
      <OfflineNote id={`${id}-offline`} />
    </form>
  );
}

/** "Action type ({n})": checkboxes in a popover, more than one allowed. */
function ActionTypes({
  value,
  onChange,
}: {
  value: AuditType[];
  onChange(next: AuditType[]): void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const toggle = (t: AuditType, on: boolean) =>
    onChange(on ? [...value, t] : value.filter((x) => x !== t));

  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-pop`}
        onClick={() => setOpen((o) => !o)}
        className={cn(control, "inline-flex items-center gap-2 font-semibold")}
      >
        Action type ({value.length})
        <ChevronDown aria-hidden className="size-4" />
      </button>
      <div
        id={`${id}-pop`}
        hidden={!open}
        className="absolute left-0 top-full z-20 mt-1 w-[260px] rounded-xl border border-lilac-2 bg-white p-3 shadow-lg"
      >
        <fieldset>
          <legend className="mb-2 text-[12px] font-semibold text-ink-2">
            Show only these action types
          </legend>
          <div className="flex flex-col">
            {AUDIT_TYPES.map((t) => (
              <label
                key={t}
                className="flex min-h-11 items-center gap-2 text-[13.5px]"
              >
                <input
                  type="checkbox"
                  checked={value.includes(t)}
                  onChange={(e) => toggle(t, e.target.checked)}
                  className="size-4 accent-mint-deep"
                />
                {TYPE_WORDS[t]}
              </label>
            ))}
          </div>
        </fieldset>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => onChange([])}
          >
            Show all types
          </Button>
        )}
      </div>
    </div>
  );
}
