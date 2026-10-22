"use client";
import { Download } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  PERIODS,
  type MeasureId,
  type Period,
} from "@/lib/api/analytics-contract";
import type { Person } from "@/lib/api/contract";
import { analyticsCsv, analyticsCsvName } from "@/lib/analytics/csv";
import {
  NOTHING_UNUSUAL,
  readAnalytics,
  type AnalyticsState,
} from "@/lib/analytics/read";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { useAnalytics } from "@/lib/queries/analytics";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { downloadCsv } from "@mhai/ui/csv";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { ChangeDetail } from "./change-detail";
import { AnalyticsTabs } from "./analytics-tabs";
import { ChangesList } from "./changes-list";
import { defaultMeasure, HospitalDetail } from "./hospitals-tab";
import { updatedLine } from "./updated-line";

export const PERIOD_LABEL: Record<Period, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export { updatedLine };

/** What the right-hand panel shows: a change, or a hospital's comparison. */
export type Detail =
  | { kind: "change"; id: string }
  | { kind: "hospital"; id: string; measure: MeasureId };

function hospitalOf(state: AnalyticsState, id: string): Person {
  const rows = state.hospitals.status === "ok" ? state.hospitals.rows : [];
  return rows.find((r) => r.hospital.id === id)?.hospital ?? { id, name: id };
}

/**
 * The Analytics page (spec §4, layout B): What changed on the left, the
 * selected change on the right, the tabs below. Each area has its own
 * "Updated {time}" and fails on its own. On phones the list shows alone;
 * a row opens the detail, with Back.
 */
export function AnalyticsView() {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const desktop = useIsDesktop();
  const [period, setPeriod] = useState<Period>("30d");
  const q = useAnalytics(period);
  const state = useMemo(
    () => (q.data ? readAnalytics(q.data) : null),
    [q.data],
  );
  const csvNet = useNeedsConnection("csv-offline");

  // What the right-hand panel shows. A change is selected by id: it keeps
  // its id for as long as it lasts. Starts on the first change, once there is one.
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [phoneDetail, setPhoneDetail] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<string | null>(null);
  const hospitalRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnToHospital = useRef<string | null>(null);

  const items = state?.changes.status === "ok" ? state.changes.items : [];
  // The first row is selected on open, and stays selected by its id when
  // the list re-ranks (after a follow-up, say).
  if (detail === null && items[0])
    setDetail({ kind: "change", id: items[0].id });
  const onHospital = detail?.kind === "hospital";
  const selected = onHospital
    ? null
    : ((detail?.kind === "change"
        ? items.find((c) => c.id === detail.id)
        : undefined) ??
      items[0] ??
      null);

  // On a phone, focus follows the view: the detail's heading on open, the
  // row it came from on Back.
  useEffect(() => {
    if (desktop) return;
    if (phoneDetail) headingRef.current?.focus();
    else if (returnTo.current) {
      rowRefs.current.get(returnTo.current)?.focus();
      returnTo.current = null;
    } else if (returnToHospital.current) {
      hospitalRefs.current.get(returnToHospital.current)?.focus();
      returnToHospital.current = null;
    }
  }, [phoneDetail, desktop]);

  const select = (id: string) => {
    setDetail({ kind: "change", id });
    if (!desktop) setPhoneDetail(true);
  };
  const pickHospital = (h: Person) => {
    setDetail({
      kind: "hospital",
      id: h.id,
      measure: defaultMeasure(items, h.id),
    });
    if (!desktop) setPhoneDetail(true);
  };
  const back = () => {
    if (detail?.kind === "hospital") returnToHospital.current = detail.id;
    else returnTo.current = selected?.id ?? null;
    setPhoneDetail(false);
  };

  const download = () => {
    const a = q.data;
    if (!a || q.isPlaceholderData) return;
    downloadCsv(analyticsCsvName(period, Date.now()), analyticsCsv(a, period));
  };

  const showList = desktop || !phoneDetail;
  const showDetail = desktop || phoneDetail;

  return (
    <>
      <TopBar title="Analytics" sub="Every active hospital" />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              Period
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className={`${inputClass} w-auto`}
              >
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {PERIOD_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <div className="ml-auto flex flex-col items-end">
              <Button
                variant="ghost"
                disabled={!q.data || q.isPlaceholderData}
                {...csvNet.props}
                onClick={download}
              >
                <Download aria-hidden className="size-4" />
                Download CSV
              </Button>
              <OfflineNote id="csv-offline" />
            </div>
          </div>
          <p className="text-[12.5px] text-ink-3">
            What changed always compares the last 7 days with the 4 weeks
            before. The period changes the charts, the tabs and the CSV.
          </p>

          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            {showList && (
              <WhatChanged
                state={state}
                failed={q.isError && !q.data}
                onRetry={() => void q.refetch()}
              >
                {state?.changes.status === "ok" && items.length > 0 && (
                  <ChangesList
                    items={items}
                    selectedId={selected?.id ?? null}
                    showAll={showAll}
                    onShowAll={() => setShowAll(true)}
                    onSelect={select}
                    rowRefs={rowRefs}
                  />
                )}
              </WhatChanged>
            )}
            {showDetail && detail?.kind === "hospital" && state && (
              <HospitalDetail
                key={detail.id}
                hospital={hospitalOf(state, detail.id)}
                measure={detail.measure}
                onMeasure={(measure) => setDetail({ ...detail, measure })}
                period={period}
                hospitals={state.hospitals}
                onBack={desktop ? undefined : back}
                headingRef={headingRef}
              />
            )}
            {showDetail && selected && state && (
              <ChangeDetail
                change={selected}
                period={period}
                hospitals={state.hospitals}
                canAct={canAct}
                onBack={desktop ? undefined : back}
                headingRef={headingRef}
              />
            )}
          </div>

          {/* Kept mounted behind a phone's detail, so the open tab stays. */}
          <div hidden={!showList}>
            <AnalyticsTabs
              state={state}
              failed={q.isError && !q.data}
              onRetry={() => void q.refetch()}
              pickedHospitalId={detail?.kind === "hospital" ? detail.id : null}
              onPickHospital={pickHospital}
              rowRefs={hospitalRefs}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** The What changed area: its own Updated line, and its own failure. */
function WhatChanged({
  state,
  failed,
  onRetry,
  children,
}: {
  state: AnalyticsState | null;
  failed: boolean;
  onRetry(): void;
  children: ReactNode;
}) {
  const titleId = useId();
  const c = state?.changes;
  return (
    <section
      aria-labelledby={titleId}
      className="card-v3 self-start px-[22px] py-5"
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 id={titleId} className="text-[15px] font-semibold">
          What changed
        </h2>
        {c?.status === "ok" && (
          <p className="text-[12.5px] text-ink-3">
            {updatedLine(c.updated_at)}
          </p>
        )}
      </div>
      {failed || c?.status === "failed" ? (
        // Never "Nothing unusual" here: the Critical guard fails closed.
        <CouldntLoad what="what changed" onRetry={onRetry} />
      ) : !c ? (
        <Loading label="Loading what changed" />
      ) : c.items.length === 0 ? (
        <p className="text-[14px] text-ink-2">{NOTHING_UNUSUAL}</p>
      ) : (
        children
      )}
    </section>
  );
}
