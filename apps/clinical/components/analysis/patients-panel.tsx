"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Eye,
  FileX2,
  OctagonAlert,
  TriangleAlert,
  Users,
  WifiOff,
} from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FindingFlag } from "@/lib/api/alerts-contract";
import type {
  AnalysisFilters,
  DeidentifiedPatientsOut,
  Drillable,
  NamedPurpose,
  PatientLevel,
  PatientRowOut,
  Sex,
} from "@/lib/api/analysis-contract";
import { ApiError } from "@/lib/api/errors";
import { countLabel } from "@/lib/admin/report";
import {
  ANALYSIS_KEYS,
  useClearanceMe,
  useNamedAccessOn,
  usePatients,
} from "@/lib/analysis-queries";
import { shows } from "@/lib/analysis/guards";
import {
  AGE_LABEL,
  NOT_STANDARDISED,
  SEX_LABEL,
  conditionText,
  settingText,
} from "@/lib/analysis/labels";
import { END_TEXT, namedNow, type EndReason } from "@/lib/analysis/named";
import { useOptionalAuth } from "@/lib/auth/auth-context";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useOnline } from "@mhai/ui/hooks/use-online";
import { SidePanel } from "@mhai/ui/side-panel";
import { Skeleton } from "@mhai/ui/skeleton";
import type { TableColumn } from "./data-table";
import { NamedView } from "./named-view";
import { PurposeDialog } from "./purpose-dialog";
import { SMALL_GROUP_MIN } from "@mhai/ui/small-groups";

/**
 * What each level of list says about itself. The level is the one place the
 * named list (Plan 11c) plugs in.
 */
const LEVEL_NOTE: Record<PatientLevel, string> = {
  deidentified: "De-identified: no names or record numbers",
  named: "Named view · this view is recorded",
};

const OFFLINE_REASON = "You're offline. Reconnect to see patients.";
const NAMES_OFFLINE = "You're offline. Reconnect to show names.";
const NEEDS_LETTER =
  "Named access needs a clearance letter. Ask your hospital admin.";

const FLAG_TEXT: Record<FindingFlag, { word: string; Icon: typeof ArrowUp }> = {
  high: { word: "High", Icon: ArrowUp },
  low: { word: "Low", Icon: ArrowDown },
  abnormal: { word: "Abnormal", Icon: TriangleAlert },
};

const sexText = (s: Sex) =>
  s === "not_recorded" ? "Sex not recorded" : SEX_LABEL[s];

const tooSmall = (e: unknown) =>
  e instanceof ApiError && e.status === 422 && e.code === "too_small";

function PatientRow({ p }: { p: PatientRowOut }) {
  const id = useId();
  return (
    <li
      aria-labelledby={id}
      className="rounded-xl border border-line bg-white px-3 py-2.5 text-[13px]"
    >
      <b id={id} className="block font-mono text-[13.5px] font-semibold">
        {p.pid}
      </b>
      <p className="text-ink-2">
        {[
          `Age ${AGE_LABEL[p.age_band]}`,
          sexText(p.sex),
          settingText(p.setting),
        ].join(" · ")}
      </p>
      {p.conditions.length > 0 && (
        <p className="mt-1 [overflow-wrap:anywhere]">
          {p.conditions.map(conditionText).join(", ")}
        </p>
      )}
      {p.findings.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 text-[12.5px] text-ink-2">
          {p.findings.map((f, i) => {
            const flag = f.flag ? FLAG_TEXT[f.flag] : null;
            return (
              <li key={i} className="[overflow-wrap:anywhere]">
                {f.name ?? NOT_STANDARDISED}
                {flag && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 font-semibold text-ink">
                    <flag.Icon aria-hidden className="size-3.5" />
                    {flag.word}
                  </span>
                )}
                {f.source_label && (
                  <span className="text-ink-3"> · {f.source_label}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * The de-identified patients behind one shown count (spec §5, level 1): a
 * side panel from `md`, a sheet below it. Never printed, never exported;
 * the list leaves the cache when the panel closes.
 */
export function PatientsPanel({
  drill,
  label,
  filters,
  level = "deidentified",
  onClose,
}: {
  drill: string;
  label: string;
  filters: AnalysisFilters;
  level?: "deidentified";
  onClose(): void;
}) {
  const q = usePatients({ drill, level, filters });
  const d = q.data?.status === "ok" ? q.data.data : null;
  const title = d
    ? `${countLabel(d.count)} patients · ${label}`
    : `Patients · ${label}`;
  const failed =
    q.data?.status === "failed" || (q.isError && !tooSmall(q.error));

  const named = useNames();
  const showing = named.view !== null;

  return (
    <SidePanel open onClose={onClose} title={title} className="print:hidden">
      {named.ended && (
        <div className="mb-3">
          <Banner tone="warn" title="Named access has ended">
            {END_TEXT[named.ended]}
          </Banner>
        </div>
      )}
      {d && !showing && <NamesOffer named={named} />}
      {showing ? (
        <NamedView
          key={named.view!.n}
          drill={drill}
          filters={filters}
          purpose={named.view!.purpose}
          note={named.view!.note}
          onEnd={named.end}
        />
      ) : (
        <PlainList level={level} d={d} q={q} failed={failed} />
      )}
      <PurposeDialog
        open={named.asking}
        online={named.online}
        onClose={() => named.setAsking(false)}
        onSubmit={named.start}
      />
    </SidePanel>
  );
}

/** One named view while it lasts: its purpose, and a number that makes it new. */
type NamedChoice = { purpose: NamedPurpose; note?: string; n: number };

/**
 * Names in the panel (Plan 11c): offered only while the switch is On, to a
 * person `clearance/me` says is covered now. A view ends by `end`, and its
 * rows leave the cache; signing out ends it too.
 */
function useNames() {
  const qc = useQueryClient();
  const user = useOptionalAuth()?.user ?? null;
  const on = useNamedAccessOn();
  const me = useClearanceMe({ poll: false });
  const online = useOnline();
  const [asking, setAsking] = useState(false);
  const [choice, setChoice] = useState<NamedChoice | null>(null);
  const [ended, setEnded] = useState<EndReason | null>(null);
  // Nothing named shows without a signed-in person and the switch On; a
  // view lost that way is over, never picked up again without a purpose.
  if (choice && !(on && user)) setChoice(null);
  const view = choice && on && user ? choice : null;

  useEffect(() => {
    if (view) return;
    // The view has gone (ended, switched, signed out): drop its rows now.
    qc.removeQueries({ queryKey: ANALYSIS_KEYS.namedAll });
  }, [view, qc]);

  return {
    on,
    me,
    online,
    view,
    ended,
    asking: asking && on,
    setAsking,
    start(purpose: NamedPurpose, note: string | undefined) {
      setAsking(false);
      setEnded(null);
      setChoice((c) => ({ purpose, note, n: (c?.n ?? 0) + 1 }));
    },
    end(reason: EndReason) {
      setChoice(null);
      setEnded(reason);
    },
  };
}

/**
 * Show names, or why not: nothing below On; the needs-a-letter line when
 * not covered; disabled offline, with the reason.
 */
function NamesOffer({ named }: { named: ReturnType<typeof useNames> }) {
  const reasonId = useId();
  if (!named.on || named.me.data === undefined) return null;
  // An `until` already past when the reply was read: not covered.
  if (!namedNow(named.me.data, named.me.dataUpdatedAt))
    return (
      <p className="mb-3 flex items-center gap-1.5 text-[13px] text-ink-2">
        <FileX2 aria-hidden className="size-4 shrink-0" />
        {NEEDS_LETTER}
      </p>
    );
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        className="min-h-11"
        disabled={!named.online}
        aria-describedby={named.online ? undefined : reasonId}
        onClick={() => named.setAsking(true)}
      >
        <Eye aria-hidden className="size-4" />
        Show names
      </Button>
      {!named.online && (
        <span
          id={reasonId}
          className="flex items-center gap-1.5 text-[12.5px] text-ink-3"
        >
          <WifiOff aria-hidden className="size-3.5 shrink-0" />
          {NAMES_OFFLINE}
        </span>
      )}
    </div>
  );
}

/** Plan 6's de-identified list, as it was. */
function PlainList({
  level,
  d,
  q,
  failed,
}: {
  level: PatientLevel;
  d: DeidentifiedPatientsOut | null;
  q: ReturnType<typeof usePatients>;
  failed: boolean;
}) {
  return (
    <>
      <p className="mb-3 flex items-center gap-1.5 text-[13px] text-ink-2">
        <Users aria-hidden className="size-4 shrink-0" />
        {LEVEL_NOTE[level]}
      </p>
      {d ? (
        <>
          {d.count > d.patients.length && (
            <p className="mb-2 text-[13px] text-ink-2">
              Showing the first {countLabel(d.patients.length)} of{" "}
              {countLabel(d.count)}
            </p>
          )}
          <ul aria-label="Patients" className="flex flex-col gap-2">
            {d.patients.map((p) => (
              <PatientRow key={p.pid} p={p} />
            ))}
          </ul>
        </>
      ) : q.isError && tooSmall(q.error) ? (
        <p role="status" className="text-[14px]">
          This group is too small to list
        </p>
      ) : failed ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-[14px]"
        >
          <OctagonAlert aria-hidden className="size-5 shrink-0 text-bad-deep" />
          <span className="flex-1">Couldn&apos;t load these patients</span>
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11"
            onClick={() => void q.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : q.fetchStatus === "paused" ? (
        <p
          role="status"
          className="flex items-center gap-2 text-[14px] text-ink-2"
        >
          <WifiOff aria-hidden className="size-4 shrink-0" />
          You&apos;re offline. The list will load when you reconnect.
        </p>
      ) : (
        <Skeleton className="h-40 rounded-2xl" />
      )}
    </>
  );
}

/** The filters the open list is for, and the offline reason's id. */
const DrillContext = createContext<{
  filters: AnalysisFilters;
  online: boolean;
  reasonId: string;
} | null>(null);

/**
 * Where a view's See patients buttons live: it knows the filters and says
 * once, when offline, why the buttons are off.
 */
export function DrillScope({
  filters,
  children,
}: {
  filters: AnalysisFilters;
  children: ReactNode;
}) {
  const online = useOnline();
  const reasonId = useId();
  return (
    <DrillContext.Provider value={{ filters, online, reasonId }}>
      {!online && (
        <p
          id={reasonId}
          className="mb-3 flex items-center gap-1.5 text-[12.5px] text-ink-3"
        >
          <WifiOff aria-hidden className="size-3.5 shrink-0" />
          {OFFLINE_REASON}
        </p>
      )}
      {children}
    </DrillContext.Provider>
  );
}

/** A shown count of 5 or more that carries a drill key; nothing else opens. */
export const drillable = (d: Drillable): d is Drillable & { drill: string } =>
  d.drill !== null && shows(d) && d.value! >= SMALL_GROUP_MIN;

/** The table's last column: See patients on drillable rows, empty otherwise. */
export const SEE_COLUMN: TableColumn = {
  key: "see",
  label: "Patient list",
  action: true,
};

/** See patients for a drillable count, or nothing (an empty cell or note). */
export const seePatients = (d: Drillable, label: string): ReactNode =>
  drillable(d) ? <SeePatients d={d} label={label} /> : null;

/**
 * See patients for one row, inside a `DrillScope`. Nothing for a hidden or
 * undrillable count. The drill key goes only in the query, never the URL.
 */
export function SeePatients({ d, label }: { d: Drillable; label: string }) {
  const scope = useContext(DrillContext);
  const qc = useQueryClient();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // The panel has gone: drop its list now, and give focus back.
    qc.removeQueries({ queryKey: [...ANALYSIS_KEYS.all, "patients"] });
    button.current?.focus();
  }, [open, qc]);

  if (!scope || !drillable(d)) return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={!scope.online}
        aria-label={`See patients · ${label}`}
        aria-describedby={scope.online ? undefined : scope.reasonId}
        onClick={() => setOpen(true)}
        className="mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-[12.5px] font-semibold text-mint-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep disabled:cursor-not-allowed disabled:text-ink-3 disabled:no-underline"
      >
        See patients
        <span className="sr-only">{` · ${label}`}</span>
      </button>
      {open && (
        <PatientsPanel
          drill={d.drill}
          label={label}
          filters={scope.filters}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
