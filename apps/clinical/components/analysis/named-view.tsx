"use client";
import { Eye, OctagonAlert, WifiOff } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
  networkDown,
  type EndReason,
} from "@/lib/analysis/named";
import { useOptionalAuth } from "@/lib/auth/auth-context";
import { Button } from "@mhai/ui/button";
import { dayLabel } from "@mhai/ui/clearances";
import { Skeleton } from "@mhai/ui/skeleton";

/**
 * setTimeout's longest wait (about 24.8 days). named_until may be months away,
 * so the timer is clamped and the 1 s check carries the rest.
 */
const LONGEST_WAIT = 2 ** 31 - 1;
/** How often the real clock is held against named_until. */
const CHECK_EVERY_MS = 1_000;

const two = (n: number) => String(n).padStart(2, "0");
const clockText = (ms: number) => {
  const d = new Date(ms);
  return `${two(d.getHours())}:${two(d.getMinutes())}`;
};

/** The real clock, read afresh when rendering decides whether names show. */
const wallClock = () => Date.now();

/**
 * Whether moving the focus would take nothing from the person: it is in
 * this element, or nowhere (on the body, as after the dialog closed).
 */
export function focusIsOurs(el: Element | null): boolean {
  const a = document.activeElement;
  return !a || a === document.body || (el !== null && el.contains(a));
}

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

const XML: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * The watermark as one tile, repeated as a background: it covers the whole
 * table however long or wide it is. An image in CSS runs no script.
 */
export function watermarkTile(text: string): string {
  const safe = text.replace(/[&<>"']/g, (c) => XML[c]!);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="140">` +
    `<text x="140" y="75" text-anchor="middle" transform="rotate(-20 140 70)" ` +
    `font-family="sans-serif" font-size="13" font-weight="600" ` +
    `fill="rgba(28,13,34,0.11)">${safe}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The named patients for one view (spec §5, level 2): Name and MRN first,
 * under the named banner, with the viewer and the time watermarked across
 * the list. Never printed, copied or exported; never kept.
 *
 * Names end, each calling `onEnd` once with the reason:
 * - at `named_until`, on a timer that runs offline too;
 * - when the 30-second `clearance/me` check changes, says names are over,
 *   can't be read, or fails for any reason but the network;
 * - on a 403 that ends access, from the named list;
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
  // The real clock, for the watermark and for hiding rows past named_until.
  const [now, setNow] = useState(() => Date.now());

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
  const bannerText = d
    ? `Named view · letter until ${dayLabel(d.clearance.end_date)} · this view is recorded`
    : "";
  const until = d?.named_until ?? null;
  // Names go at named_until without waiting for the server. A timer alone
  // can outlive it (sleep, a restored page, a frozen tab: timers pause), so
  // the real clock is also checked every second and whenever the page
  // comes back.
  useEffect(() => {
    if (until === null) return;
    const check = () => {
      const t = Date.now();
      const over = msUntil(until, t) === 0;
      if (over) {
        // Hide the rows now, before the browser paints again (a restored
        // page or a wake runs this first).
        flushSync(() => {
          setNow(t);
          end("until");
        });
        return;
      }
      // Re-render only when the watermark's minute moves.
      setNow((was) =>
        Math.floor(was / 60_000) !== Math.floor(t / 60_000) ? t : was,
      );
    };
    const back = () => {
      if (document.visibilityState === "visible") check();
    };
    const exact = setTimeout(
      check,
      Math.min(msUntil(until, Date.now()), LONGEST_WAIT),
    );
    const tick = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", back);
    window.addEventListener("pageshow", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    return () => {
      clearTimeout(exact);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [until]);

  // Focus and what is said, once each: the view takes the focus while it
  // loads (the dialog's opener has gone) and the banner once names show,
  // but only if the focus is still ours (in the view, or nowhere). Never
  // pulled from the filters or the search: then the polite region says it.
  const root = useRef<HTMLDivElement>(null);
  const banner = useRef<HTMLParagraphElement>(null);
  const said = useRef<HTMLParagraphElement>(null);
  const loaded = d !== null;
  const settle = useEffectEvent(() => {
    const say = (text: string) => {
      if (said.current) said.current.textContent = text;
    };
    if (!loaded) {
      if (focusIsOurs(root.current)) root.current?.focus();
      say("Loading named patients…");
    } else if (banner.current && focusIsOurs(root.current)) {
      // The focused banner is read; the region stays quiet.
      say("");
      banner.current.focus();
    } else if (banner.current) say(`Names shown. ${bannerText}`);
  });
  useEffect(() => {
    settle();
  }, [loaded]);

  // A refusal that ends access, from the list.
  useEffect(() => {
    const r = endReasonFrom(q.error);
    if (r) end(r);
  }, [q.error]);

  // The check failing ends names (fail closed), unless the network is down:
  // then the named_until timer keeps running and the next check decides.
  useEffect(() => {
    if (me.error && !networkDown(me.error))
      end(endReasonFrom(me.error) ?? "changed");
  }, [me.error]);

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

  // Never a frame of old names: other filters, or past named_until (read
  // afresh, not only the last tick).
  if (!user || !sameAsAsked) return null;
  // A refusal that ends access, or a check that says names are over, hides
  // the rows on the render that sees it. The effects above call `onEnd`
  // only after the commit, and the browser may paint before they run.
  const stopped =
    endReasonFrom(q.error) !== null ||
    (me.error !== null && !networkDown(me.error)) ||
    me.data === null ||
    (me.data !== undefined && (!me.data.named || me.data.until === null));
  const live =
    !stopped &&
    d !== null &&
    Math.max(now, wallClock()) < Date.parse(d.named_until);
  const mark = `${user.fullName ?? user.displayName} · ${clockText(now)}`;
  const failed = q.data?.status === "failed" || (q.isError && !d);

  return (
    <div
      ref={root}
      tabIndex={-1}
      data-named-view
      className="print:hidden focus:outline-none"
    >
      {/* Written once per change by `settle`; React gives it no children. */}
      <p ref={said} role="status" className="sr-only" />
      {d && !live ? null : d ? (
        <>
          <p
            ref={banner}
            tabIndex={-1}
            data-named-banner
            className="mb-3 flex items-start gap-1.5 rounded-xl border border-warn-line bg-warn-wash px-3 py-2 text-[13px] font-semibold text-warn-deep focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
            {bannerText}
          </p>
          {d.count > d.patients.length && (
            <p className="mb-2 text-[13px] text-ink-2">
              Showing the first {countLabel(d.patients.length)} of{" "}
              {countLabel(d.count)}
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-line bg-white">
            {/* Sized to the table's whole scroll area, so the watermark is too. */}
            <div className="relative inline-block min-w-full align-top">
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
                      <th
                        key={h}
                        scope="col"
                        className="px-3 py-2 font-semibold"
                      >
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
                data-watermark={mark}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 select-none bg-repeat"
                style={{ backgroundImage: watermarkTile(mark) }}
              />
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
