"use client";
import { Download } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import type {
  AuditEvent,
  AuditPerson,
  Letter,
  NamedAccessFilters,
} from "@/lib/api/audit-contract";
import { formatWhen } from "@/lib/activity-labels";
import { checkCustomRange, rangeOf, type Preset } from "@/lib/audit/dates";
import {
  LETTER_STATUS_WORDS,
  REASON_WORDS,
  viewWords,
} from "@/lib/audit/kinds";
import { ID, type NamedRow } from "@/lib/audit/read";
import { hospitalWords, whoLine } from "@/lib/audit/words";
import { dateLabel } from "@/lib/format";
import {
  useAuditHospitals,
  useNamedAccess,
  useReportUndisplayable,
} from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useNow } from "@mhai/ui/hooks/use-now";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import {
  DayInput,
  PRESETS,
  control,
  daysOf,
  labelClass,
} from "./event-filters";
import { ExportDialog } from "./export-dialog";
import { undisplayableLine } from "./events-list";
import { PersonPicker } from "./person-picker";

export const NAMED_NOTE =
  "Names and MRNs are never recorded here. Patients appear only by the hospital's pseudonymous id; the hospital can match them to its own records.";
export const NAMED_EXPORT_NEEDS = "Choose one hospital, and a letter or dates.";
const LETTER_INVALID =
  "Enter an exact letter id: letters, numbers, - and _ only.";

/** The filters, held by the audit view so they survive a tab switch. */
export type NamedState = {
  /** "" for all hospitals, else a hospital id. */
  hospital: string;
  person: AuditPerson | null;
  /** The applied letter id; "" for any. */
  letter: string;
  /** "any": no date limit (when arriving at one letter). */
  preset: Preset | "any";
  range: { from: string; to: string };
  fromDay: string;
  toDay: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayOf = (ms: number) => {
  const t = new Date(ms);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};

/**
 * The tab's starting state. Arriving at a letter with no dates (from an
 * event) shows every date, so that entry is in the list whatever its age;
 * otherwise Last 30 days, as in Events.
 */
export function initialNamed(
  now: number,
  initial?: NamedAccessFilters,
): NamedState {
  const range = rangeOf("30d", now);
  const base: NamedState = {
    hospital: initial?.hospital ?? "",
    person: null,
    letter: initial?.clearance ?? "",
    preset: "30d",
    range,
    ...daysOf(range),
  };
  if (initial?.from && initial.to)
    return {
      ...base,
      preset: "custom",
      fromDay: dayOf(Date.parse(initial.from)),
      toDay: dayOf(Date.parse(initial.to) - 1),
    };
  if (initial?.clearance) return { ...base, preset: "any" };
  return base;
}

function filtersOf(
  s: NamedState,
  now: number,
): { filters: NamedAccessFilters; dated: boolean } | { error: string } {
  const f: NamedAccessFilters = {};
  if (s.hospital) f.hospital = s.hospital;
  if (s.person) f.person = s.person.id;
  if (s.letter) f.clearance = s.letter;
  if (s.preset === "any") return { filters: f, dated: false };
  const range =
    s.preset === "custom" ? checkCustomRange(s.fromDay, s.toDay, now) : s.range;
  if ("error" in range) return { error: range.error };
  return { filters: { ...f, from: range.from, to: range.to }, dated: true };
}

const patientsWords = (n: number | undefined) =>
  n === undefined ? "" : n === 1 ? "1 patient" : `${n} patients`;

type Entry = AuditEvent & { letter: Letter };
type Group = {
  key: string;
  hospital: AuditEvent["hospital"];
  letters: { letter: Letter; entries: Entry[] }[];
};

/** By hospital, then letter, in the order first met (newest first). */
function grouped(rows: NamedRow[]): { groups: Group[]; bad: NamedRow[] } {
  const groups: Group[] = [];
  const bad: NamedRow[] = [];
  for (const r of rows) {
    if (!r.ok) {
      bad.push(r);
      continue;
    }
    const e = r.event;
    const key = e.hospital?.id ?? "platform";
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push((g = { key, hospital: e.hospital, letters: [] }));
    let l = g.letters.find((x) => x.letter.id === e.letter.id);
    if (!l) g.letters.push((l = { letter: e.letter, entries: [] }));
    l.entries.push(e);
  }
  return { groups, bad };
}

/** "cl_x · Active · Valid 1 Jan 2026 to 1 Jan 2027 · Verified by Tunde". */
export const letterHeading = (l: Letter): string =>
  [
    l.id,
    LETTER_STATUS_WORDS[l.status],
    `Valid ${dateLabel(l.valid_from)} to ${dateLabel(l.valid_to)}`,
    l.verified_by ? `Verified by ${l.verified_by.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

const purposeWords = (e: Entry) =>
  e.facts.purpose && Object.hasOwn(REASON_WORDS, e.facts.purpose)
    ? REASON_WORDS[e.facts.purpose]
    : "";

const HEADERS = ["Who", "When", "View", "Patients", "Purpose"];

function LetterGroup({
  letter,
  entries,
  desktop,
}: {
  letter: Letter;
  entries: Entry[];
  desktop: boolean;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id} className="card-v3 overflow-x-auto">
      <h4
        id={id}
        className="border-b border-line px-4 py-3 text-[13.5px] font-semibold [overflow-wrap:anywhere]"
      >
        {letterHeading(letter)}
      </h4>
      {desktop ? (
        <table className="w-full min-w-[720px] text-left text-[13px]">
          <caption className="sr-only">Named access under {letter.id}</caption>
          <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
            <tr>
              {HEADERS.map((h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {whoLine(e.actor)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <time dateTime={e.at}>{formatWhen(e.at)}</time>
                </td>
                <td className="px-4 py-3">{viewWords(e.facts.view)}</td>
                <td className="px-4 py-3">
                  {patientsWords(e.facts.patient_count)}
                </td>
                <td className="px-4 py-3">{purposeWords(e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="divide-y divide-line px-4">
          {entries.map((e) => (
            <li key={e.id} className="py-3 text-[13.5px]">
              <p className="font-semibold [overflow-wrap:anywhere]">
                {whoLine(e.actor)}
              </p>
              <p className="mt-0.5 text-ink-2">
                {viewWords(e.facts.view)}
                {e.facts.patient_count !== undefined &&
                  ` · ${patientsWords(e.facts.patient_count)}`}
                {purposeWords(e) && ` · ${purposeWords(e)}`}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-2">
                <time dateTime={e.at}>{formatWhen(e.at)}</time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The letter id: applies on blur or Enter, as the dates do. */
function LetterInput({
  value,
  onApply,
}: {
  value: string;
  onApply(v: string): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const apply = () => {
    if (draft === null) return;
    const v = draft.trim();
    if (v && !ID.test(v)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(null);
    if (v !== value) onApply(v);
  };
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        Clearance letter id
      </label>
      <input
        id={id}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={apply}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          apply();
        }}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-bad` : undefined}
        className={`${control} font-mono`}
      />
      {invalid && (
        <p id={`${id}-bad`} role="alert" className="text-[13px] text-bad">
          {LETTER_INVALID}
        </p>
      )}
    </div>
  );
}

/**
 * Named access (spec §6.3): the named patient lists opened under a
 * clearance letter, by hospital and letter, with the legal-request export.
 * Pseudonyms are never listed. Filters live in memory, here or in the audit
 * view, and never in the URL or in storage.
 */
export function NamedAccessTab({
  initial,
  value,
  onChange,
}: {
  /** Filters to open at (from an event or a hand-off). */
  initial?: NamedAccessFilters;
  /** Held by the caller, so a tab switch keeps them; else held here. */
  value?: NamedState;
  onChange?(next: NamedState): void;
}) {
  const [own, setOwn] = useState(() => initialNamed(Date.now(), initial));
  const state = value ?? own;
  const set = (p: Partial<NamedState>) => {
    const next = { ...state, ...p };
    if (onChange) onChange(next);
    else setOwn(next);
  };
  const desktop = useIsDesktop();
  const now = useNow();
  const net = useNeedsConnection("named-export-offline");
  const more = useNeedsConnection("named-more-offline");
  const hospitals = useAuditHospitals();
  const [exporting, setExporting] = useState(false);
  const id = useId();

  const built = filtersOf(state, now);
  const error = "error" in built ? built.error : null;
  const filters = "filters" in built ? built.filters : {};
  const q = useNamedAccess(filters, error === null);
  const rows = useMemo(
    () => q.data?.pages.flatMap((p) => p.events) ?? [],
    [q.data],
  );
  useReportUndisplayable(rows);
  const { groups, bad } = useMemo(() => grouped(rows), [rows]);

  const canExport =
    "filters" in built &&
    !!built.filters.hospital &&
    (!!built.filters.clearance || built.dated);
  const hospitalName =
    hospitals.data?.find((h) => h.id === state.hospital)?.name ?? null;

  function choosePreset(p: Preset | "any") {
    if (p === "custom") {
      const r =
        state.preset === "custom" || state.preset === "any"
          ? null
          : daysOf(state.range);
      set({ preset: p, ...(r ?? {}) });
    } else if (p === "any") set({ preset: p });
    else set({ preset: p, range: rangeOf(p, Date.now()) });
  }

  let body: ReactNode = null;
  if (error === null) {
    if (q.isError && !q.data)
      body = (
        <CouldntLoad what="the audit log" onRetry={() => void q.refetch()} />
      );
    else if (q.isPending && q.fetchStatus === "paused")
      body = (
        <div
          role="status"
          className="card-v3 p-6 text-center text-[14px] text-ink-2"
        >
          You&apos;re offline. Named access will load when you reconnect.
        </div>
      );
    else if (q.isPending) body = <Loading label="Loading named access" />;
    else
      body = (
        <div className="flex flex-col gap-4">
          {rows.length === 0 && <Empty title="Nothing matches these filters" />}
          {groups.map((g) => (
            <section
              key={g.key}
              aria-labelledby={`${id}-${g.key}`}
              className="flex flex-col gap-3"
            >
              <h3
                id={`${id}-${g.key}`}
                className="font-display text-[18px] font-black"
              >
                {hospitalWords(g.hospital)}
              </h3>
              {g.letters.map((l) => (
                <LetterGroup
                  key={l.letter.id}
                  letter={l.letter}
                  entries={l.entries}
                  desktop={desktop}
                />
              ))}
            </section>
          ))}
          {bad.length > 0 && (
            <ul className="card-v3 divide-y divide-line px-4">
              {bad.map((r, i) => (
                <li
                  key={i}
                  className="py-3 font-mono text-[13px] text-ink-2 [overflow-wrap:anywhere]"
                >
                  {r.ok ? null : undisplayableLine(r)}
                </li>
              ))}
            </ul>
          )}
          {q.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-2 rounded-xl border border-lilac-2 bg-white px-4 py-3 text-[13.5px]"
            >
              <span>
                Couldn&apos;t refresh the audit log. Showing what was loaded.
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void (q.isFetchNextPageError
                    ? q.fetchNextPage()
                    : q.refetch())
                }
              >
                Try again
              </Button>
            </div>
          )}
          {q.hasNextPage && (
            <div className="flex flex-col items-center">
              <Button
                variant="ghost"
                disabled={q.isFetchingNextPage || more.offline}
                aria-busy={q.isFetchingNextPage}
                onClick={() => void q.fetchNextPage()}
                {...more.props}
              >
                {q.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
              <OfflineNote id="named-more-offline" />
            </div>
          )}
        </div>
      );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-xl bg-lilac px-3 py-2 text-[13px] text-bloom">
        {NAMED_NOTE}
      </p>

      <div
        role="group"
        aria-label="Filters"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-h`} className={labelClass}>
            Hospital
          </label>
          <select
            id={`${id}-h`}
            value={state.hospital}
            onChange={(e) => set({ hospital: e.target.value })}
            className={control}
          >
            <option value="">All hospitals</option>
            {hospitals.data?.map((h) => (
              <option key={h.id} value={h.id}>
                {hospitalWords(h)}
              </option>
            ))}
          </select>
        </div>

        <PersonPicker
          value={state.person}
          onChange={(person) => set({ person })}
        />

        <LetterInput
          value={state.letter}
          onApply={(letter) =>
            // "Any date" is offered only with a letter: clearing it goes back.
            set(
              letter === "" && state.preset === "any"
                ? { letter, preset: "30d", range: rangeOf("30d", Date.now()) }
                : { letter },
            )
          }
        />

        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-d`} className={labelClass}>
            Dates
          </label>
          <select
            id={`${id}-d`}
            value={state.preset}
            onChange={(e) => choosePreset(e.target.value as Preset | "any")}
            className={control}
          >
            {PRESETS.map(([p, words]) => (
              <option key={p} value={p}>
                {words}
              </option>
            ))}
            {state.letter !== "" && <option value="any">Any date</option>}
          </select>
        </div>

        {state.preset === "custom" && (
          <>
            <DayInput
              id={`${id}-from`}
              label="From"
              value={state.fromDay}
              onApply={(fromDay) => set({ fromDay })}
              errorId={error ? `${id}-range` : undefined}
            />
            <DayInput
              id={`${id}-to`}
              label="To"
              value={state.toDay}
              onApply={(toDay) => set({ toDay })}
              errorId={error ? `${id}-range` : undefined}
            />
          </>
        )}
      </div>

      {error && (
        <p id={`${id}-range`} role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}

      <div className="flex flex-col items-start gap-1">
        <Button
          variant="ghost"
          disabled={!canExport || net.offline}
          aria-describedby={canExport ? undefined : `${id}-need`}
          onClick={() => setExporting(true)}
          {...net.props}
        >
          <Download aria-hidden className="size-4" />
          Export for a legal request
        </Button>
        {!canExport && (
          <p id={`${id}-need`} className="text-[13px] text-ink-2">
            {NAMED_EXPORT_NEEDS}
          </p>
        )}
        <OfflineNote id="named-export-offline" />
      </div>

      {body}

      <ExportDialog
        kind="named_access"
        filters={exporting ? filters : {}}
        names={{
          hospital: hospitalName,
          person: state.person?.name ?? null,
          clearance: state.letter || null,
        }}
        count={null}
        open={exporting}
        onClose={() => setExporting(false)}
      />
    </div>
  );
}
