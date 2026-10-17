"use client";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ageLabel } from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import {
  findingLine,
  locationLabel,
  severityOf,
} from "@/lib/notifications/alert-view";
import { NOTIFICATIONS_HREF } from "@/lib/notifications/popups";
import { StatusChip } from "../corrections/chips";
import { useDecisions } from "../corrections/decisions-provider";
import { useAlerts } from "./alerts-provider";
import { NotStandardisedChip, SeverityChip } from "./chips";

/** The latest few of each kind in the panel (spec §2). */
export const BELL_ALERTS = 4;
export const BELL_DECISIONS = 3;

/** Criticals first, then the newest others, up to the cap: newer routine alerts never push a Critical out. */
function bellAlerts<T extends { severity: string }>(list: T[]): T[] {
  const critical = list.filter((x) => severityOf(x.severity) === "critical");
  const rest = list.filter((x) => severityOf(x.severity) !== "critical");
  return [...critical, ...rest].slice(0, BELL_ALERTS);
}

const HEADING =
  "px-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint";

/**
 * The top bar's bell: one notification centre for patient alerts and
 * decisions on your corrections (spec §2). One count (R1); pop-ups can be
 * reached from here too (spec §6).
 */
export function NotificationBell() {
  const d = useDecisions();
  const a = useAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const now = useNow(60_000);

  useEffect(() => {
    if (!open) return;
    ref.current
      ?.querySelector<HTMLElement>("[data-panel] button, [data-panel] a")
      ?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  if (!d && !a) return null;
  const count = (a?.unread ?? 0) + (d?.unseen ?? 0);
  const label = count ? `Notifications, ${count} unread` : "Notifications";
  const alerts = a?.available ? bellAlerts(a.latest) : [];
  const notes = (d?.notes ?? []).slice(0, BELL_DECISIONS);
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    if (!open || e.key !== "Escape") return;
    e.preventDefault();
    e.nativeEvent.stopPropagation();
    close(true);
  };

  return (
    <div ref={ref} className="relative" onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          d?.markSeen();
        }}
        className="relative grid size-11 place-items-center rounded-xl border border-line bg-white text-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep md:size-[34px] md:rounded-[10px]"
      >
        <Bell aria-hidden className="size-4" />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad-deep px-1 font-mono text-[10px] font-bold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div
          id={panelId}
          data-panel
          role="region"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+8px)] z-30 print:hidden w-[min(360px,92vw)] rounded-2xl bg-white p-3 text-left shadow-[0_30px_60px_-20px_#46035166] ring-1 ring-line"
        >
          <h2 className="px-1 text-[13px] font-semibold">Notifications</h2>
          {a?.available && (
            <section aria-labelledby={`${panelId}-alerts`} className="mt-2">
              <h3 id={`${panelId}-alerts`} className={HEADING}>
                Patient alerts
              </h3>
              {alerts.length ? (
                <ul className="mt-1 flex max-h-[34vh] flex-col overflow-auto">
                  {alerts.map((al) => (
                    <li
                      key={al.id}
                      className="border-t border-line first:border-0"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          close(false);
                          a.openAlert(al.id);
                        }}
                        className="flex min-h-11 w-full flex-col gap-1 rounded-xl px-1 py-2.5 text-left text-[13px] hover:bg-bg focus-visible:outline-2 focus-visible:outline-mint-deep"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <SeverityChip severity={al.severity} />
                          <b className="min-w-0 [overflow-wrap:anywhere]">
                            {al.patient.full_name}
                          </b>
                        </span>
                        <span className="[overflow-wrap:anywhere]">
                          {findingLine(al.finding)}
                          {!al.finding.standardised && (
                            <>
                              {" "}
                              <NotStandardisedChip />
                            </>
                          )}
                        </span>
                        <small className="text-ink-3 [overflow-wrap:anywhere]">
                          {locationLabel(al.patient.location)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 px-1 text-[13px] text-ink-3">
                  No new patient alerts.
                </p>
              )}
            </section>
          )}
          <section aria-labelledby={`${panelId}-decisions`} className="mt-3">
            <h3 id={`${panelId}-decisions`} className={HEADING}>
              Decisions on your corrections
            </h3>
            {notes.length ? (
              <ul className="mt-1 flex max-h-[26vh] flex-col overflow-auto">
                {notes.map((n) => (
                  <li
                    key={`${n.id}-${n.at}`}
                    className="flex flex-col gap-1 border-t border-line px-1 py-2.5 text-[13px] first:border-0"
                  >
                    <span className="flex items-center gap-2">
                      <StatusChip status={n.status} />
                      <b className="min-w-0 [overflow-wrap:anywhere]">
                        {n.title}
                      </b>
                    </span>
                    <small className="text-ink-3">
                      {[n.by, `${ageLabel(n.at, now)} ago`]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    {n.reason && (
                      <small className="text-bad-deep [overflow-wrap:anywhere]">
                        Reason: {n.reason}
                      </small>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 px-1 text-[13px] text-ink-3">
                No decisions yet. When a reviewer decides on a correction you
                suggested, it shows here.
              </p>
            )}
            <p className="mt-1 px-1 text-[11px] text-ink-3">
              Decisions are kept for this session only.
            </p>
          </section>
          <Link
            href={NOTIFICATIONS_HREF}
            onClick={() => close(false)}
            className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-lilac text-[13px] font-semibold text-bloom focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            See all
          </Link>
        </div>
      )}
    </div>
  );
}
