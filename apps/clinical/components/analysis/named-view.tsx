"use client";
import { Eye, OctagonAlert, WifiOff } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { FindingFlag } from "@/lib/api/alerts-contract";
import type {
  AnalysisFilters,
  ClearanceMeOut,
  NamedPatientRowOut,
  NamedPurpose,
} from "@/lib/api/analysis-contract";
import { countLabel } from "@/lib/admin/report";
import { useClearanceMe, useNamedPatients } from "@/lib/analysis-queries";
import {
  AGE_LABEL,
  NOT_STANDARDISED,
  SEX_LABEL,
  conditionText,
  settingText,
} from "@/lib/analysis/labels";
import {
  endReasonFrom,
  meChanged,
  msUntil,
  type EndReason,
} from "@/lib/analysis/named";
import { useOptionalAuth } from "@/lib/auth/auth-context";
import { Button } from "@mhai/ui/button";
import { dayLabel } from "@mhai/ui/clearances";
import { Skeleton } from "@mhai/ui/skeleton";

/** setTimeout's longest wait; named_until is never near it (an hour at most). */
const LONGEST_WAIT = 2 ** 31 - 1;
/** How many times the watermark repeats over the list. */
const MARKS = 40;

const two = (n: number) => String(n).padStart(2, "0");
const clockText = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** Stable text for filters, so a new object with the same filters isn't a change. */
const filtersText = (f: AnalysisFilters) =>
  JSON.stringify(Object.entries(f).sort(([a], [b]) => a.localeCompare(b)));

const FLAG_WORD: Record<FindingFlag, string> = {
  high: "High",
  low: "Low",
  abnormal: "Abnormal",
};

const sexText = (s: NamedPatientRowOut["sex"]) =>
  s === "not_recorded" ? "Sex not recorded" : SEX_LABEL[s];

/** The time now, for the watermark, moving on each minute. */
function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/**
 * The named patients for one view (spec §5, level 2): Name and MRN first,
 * under the named banner, with the viewer and the time watermarked across
 * the list. Never printed, copied or exported; never kept.
 *
 * Names end, each calling `onEnd` once with the reason:
 * - at `named_until`, on a timer that runs offline too;
 * - when the 30-second `clearance/me` check changes (or says names are over);
 * - on a 403 that ends access, from the named list or the check;
 * - when the drill or the filters change.
 *
 * The request is fixed when the view opens, with its own Idempotency-Key, so
 * a refetch is the same recorded view. Showing names again is a new view.
 */
export function NamedView({
  drill,
  filters,
  purpose,
  note,
  onEnd,
}: {
  drill: string;
  filters: AnalysisFilters;
  purpose: NamedPurpose;
  note?: string;
  onEnd(reason: EndReason): void;
}) {
  const user = useOptionalAuth()?.user ?? null;
  const [req] = useState(() => ({
    drill,
    purpose,
    ...(note ? { note } : {}),
    filters,
    idempotencyKey: crypto.randomUUID(),
  }));
  const q = useNamedPatients(user ? req : null);
  const me = useClearanceMe({ poll: true });
  const now = useClock();

  const done = useRef(false);
  const end = useEffectEvent((reason: EndReason) => {
    if (done.current) return;
    done.current = true;
    onEnd(reason);
  });

  // Another group or other filters: a new view needs a new purpose.
  const sameAsAsked =
    drill === req.drill && filtersText(filters) === filtersText(req.filters);
  useEffect(() => {
    if (!sameAsAsked) end("filters");
  }, [sameAsAsked]);

  const d = q.data?.status === "ok" ? q.data.data : null;
  const until = d?.named_until ?? null;
  // Names go at named_until without waiting for the server.
  useEffect(() => {
    if (until === null) return;
    const t = setTimeout(
      () => end("until"),
      Math.min(msUntil(until, Date.now()), LONGEST_WAIT),
    );
    return () => clearTimeout(t);
  }, [until]);

  // A refusal that ends access, from the list or from the check.
  useEffect(() => {
    const r = endReasonFrom(q.error) ?? endReasonFrom(me.error);
    if (r) end(r);
  }, [q.error, me.error]);

  // The check: anything but the same, still-current letter ends names.
  const first = useRef<ClearanceMeOut | null>(null);
  useEffect(() => {
    const m = me.data;
    if (m === undefined) return;
    if (m === null || !m.named || m.until === null)
      end(endReasonFrom(m) ?? "changed");
    else if (msUntil(m.until, Date.now()) === 0) end("until");
    else if (first.current === null) first.current = m;
    else if (meChanged(first.current, m)) end(endReasonFrom(m) ?? "changed");
  }, [me.data]);

  if (!user) return null;
  const mark = `${user.displayName} · ${clockText(now)}`;
  const failed = q.data?.status === "failed" || (q.isError && !d);

  return (
    <div data-named-view className="print:hidden">
      {d ? (
        <>
          <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-warn-line bg-warn-wash px-3 py-2 text-[13px] font-semibold text-warn-deep">
            <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
            {`Named view · letter until ${dayLabel(d.clearance.end_date)} · this view is recorded`}
          </p>
          {d.count > d.patients.length && (
            <p className="mb-2 text-[13px] text-ink-2">
              Showing the first {countLabel(d.patients.length)} of{" "}
              {countLabel(d.count)}
            </p>
          )}
          <div className="relative overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-left text-[13px]">
              <caption className="sr-only">
                {`Named patients · ${countLabel(d.patients.length)}`}
              </caption>
              <thead className="border-b border-line text-[12px] text-ink-3">
                <tr>
                  {[
                    "Name",
                    "MRN",
                    "Patient ID",
                    "Age, sex and location",
                    "Conditions and findings",
                  ].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.patients.map((p) => (
                  <tr key={p.pid} className="border-b border-line align-top">
                    <th scope="row" className="px-3 py-2 font-semibold">
                      {p.name}
                    </th>
                    <td className="px-3 py-2 font-mono">{p.mrn}</td>
                    <td className="px-3 py-2 font-mono">{p.pid}</td>
                    <td className="px-3 py-2 text-ink-2">
                      {[
                        `Age ${AGE_LABEL[p.age_band]}`,
                        sexText(p.sex),
                        settingText(p.setting),
                      ].join(" · ")}
                    </td>
                    <td className="px-3 py-2 [overflow-wrap:anywhere]">
                      {[
                        ...p.conditions.map(conditionText),
                        ...p.findings.map((f) =>
                          f.flag
                            ? `${f.name ?? NOT_STANDARDISED} (${FLAG_WORD[f.flag]})`
                            : (f.name ?? NOT_STANDARDISED),
                        ),
                      ].join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              data-watermark
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex select-none flex-wrap content-start gap-x-10 gap-y-12 overflow-hidden p-4 text-[13px] font-semibold text-ink/10"
            >
              {Array.from({ length: MARKS }, (_, i) => (
                <span key={i} className="-rotate-12 whitespace-nowrap">
                  {mark}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : failed ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 text-[14px]"
        >
          <OctagonAlert aria-hidden className="size-5 shrink-0 text-bad-deep" />
          <span className="flex-1">Couldn&apos;t load named patients</span>
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
          You&apos;re offline. Names will load when you reconnect.
        </p>
      ) : (
        <Skeleton className="h-40 rounded-2xl" />
      )}
    </div>
  );
}
