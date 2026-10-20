"use client";
import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AlertSeverity, AlertStatus } from "@/lib/api/alerts-contract";
import { useNow } from "@mhai/ui/hooks/use-now";
import {
  alertsOff,
  useAlertList,
  type AlertFilter,
} from "@/lib/notification-queries";
import {
  ALERT_STATUS_LABEL,
  SEVERITY,
  showSources,
} from "@/lib/notifications/alert-view";
import { FilterChip } from "../corrections/filter-chip";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { AlertCard, alertDomId } from "./alert-card";
import { useAlerts } from "./alerts-provider";
import { NotificationsFrame } from "./notifications-frame";

const STATUSES: AlertStatus[] = ["new", "handled", "dismissed"];
const SEVERITIES: AlertSeverity[] = ["critical", "urgent", "info"];
const SEVERITY_ICON = {
  critical: OctagonAlert,
  urgent: AlertTriangle,
  info: Info,
} as const;
const EMPTY: Record<AlertStatus, string> = {
  new: "No new patient alerts. When MHAI spots an abnormal result for one of your patients, it shows here.",
  handled: "No acknowledged alerts yet.",
  dismissed: "No dismissed alerts yet.",
};

/** The Patient alerts tab. Each "View" starts it again from New (its key, R3). */
export function AlertsTab() {
  const a = useAlerts();
  return (
    <NotificationsFrame current="alerts">
      <AlertsView key={a?.focusSeq ?? 0} />
    </NotificationsFrame>
  );
}

/** Filters and the alert cards (spec §2, §3). Filters live in state, never the URL (R3). */
export function AlertsView() {
  const ctx = useAlerts();
  const now = useNow(60_000);
  const [status, setStatus] = useState<AlertStatus>("new");
  const [severity, setSeverity] = useState<AlertSeverity | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const filter: AlertFilter = {
    status,
    ...(severity ? { severity } : {}),
    ...(source ? { source } : {}),
  };
  const q = useAlertList(filter);
  const alerts = useMemo(
    () => q.data?.pages.flatMap((p) => p.alerts) ?? [],
    [q.data],
  );
  const sources = q.data?.pages[0]?.sources ?? [];
  const multi = showSources(sources);
  const focusId = ctx?.focusId ?? null;
  const focusDone = ctx?.focusDone;

  // Bring the alert a pop-up or the bell asked for into view, once the
  // latest list is in.
  useEffect(() => {
    if (!focusId) return;
    // A failed list has nothing to show; don't leave the request hanging.
    if (q.isError) {
      focusDone?.();
      return;
    }
    if (!q.isSuccess || q.isFetching) return;
    const el = document.getElementById(alertDomId(focusId));
    if (el) {
      // "auto" never animates, so reduced motion is respected.
      el.scrollIntoView?.({ block: "center", behavior: "auto" });
      el.focus();
    }
    focusDone?.();
  }, [focusId, q.isSuccess, q.isError, q.isFetching, alerts, focusDone]);

  return (
    <>
      <div className="print:hidden">
        <p className="mb-3 text-[13.5px] text-ink-2">
          Abnormal results MHAI spotted for your patients, with likely causes to
          check. You decide what happens next.
        </p>
        <div
          role="group"
          aria-label="Status"
          className="mb-2 flex flex-wrap gap-1.5"
        >
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              pressed={status === s}
              onClick={() => setStatus(s)}
            >
              {ALERT_STATUS_LABEL[s]}
            </FilterChip>
          ))}
        </div>
        <div
          role="group"
          aria-label="Severity"
          className="mb-2 flex flex-wrap gap-1.5"
        >
          <FilterChip
            pressed={severity === null}
            onClick={() => setSeverity(null)}
          >
            All severities
          </FilterChip>
          {SEVERITIES.map((s) => {
            const Icon = SEVERITY_ICON[s];
            return (
              <FilterChip
                key={s}
                pressed={severity === s}
                onClick={() => setSeverity(s)}
              >
                {severity !== s && <Icon aria-hidden className="size-3.5" />}
                {SEVERITY[s].label}
              </FilterChip>
            );
          })}
        </div>
        {multi && (
          <div
            role="group"
            aria-label="Source"
            className="mb-2 flex flex-wrap gap-1.5"
          >
            <FilterChip
              pressed={source === null}
              onClick={() => setSource(null)}
            >
              All systems
            </FilterChip>
            {sources.map((s) => (
              <FilterChip
                key={s}
                pressed={source === s}
                onClick={() => setSource(s)}
              >
                {s}
              </FilterChip>
            ))}
          </div>
        )}
        <div aria-live="polite" className="sr-only">
          {q.isPlaceholderData
            ? "Updating alerts"
            : q.isSuccess
              ? `${alerts.length} ${alerts.length === 1 ? "alert" : "alerts"} shown`
              : ""}
        </div>
        {q.isPending ? (
          <div aria-busy="true" className="mt-4 flex flex-col gap-3">
            <span className="sr-only">Loading patient alerts</span>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        ) : !q.data ? (
          alertsOff(q.error) ? (
            <section className="card-v3 mt-4 px-[22px] py-6 text-[14px] text-ink-2">
              <h3 className="text-base font-semibold text-ink">
                Patient alerts aren&apos;t switched on for your hospital yet
              </h3>
              <p className="mt-1">
                When your hospital connects its patient records, alerts for your
                patients will show here.
              </p>
            </section>
          ) : (
            <div className="mt-4">
              <Banner tone="bad" title="Couldn't load patient alerts">
                Check your connection and try again.
              </Banner>
              <Button
                variant="ghost"
                className="mt-3"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </div>
          )
        ) : alerts.length === 0 ? (
          <p className="mt-4 text-[13.5px] text-ink-3">{EMPTY[status]}</p>
        ) : (
          <ul
            aria-label="Patient alerts"
            aria-busy={q.isFetching || undefined}
            inert={q.isPlaceholderData || undefined}
            className={`mt-4 flex flex-col gap-3 ${q.isPlaceholderData ? "opacity-60" : ""}`}
          >
            {alerts.map((a) => (
              <li key={a.id}>
                <AlertCard alert={a} now={now} showSource={multi} />
              </li>
            ))}
          </ul>
        )}
        {q.hasNextPage && (
          <Button
            variant="ghost"
            className="mt-4"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            Show more alerts
          </Button>
        )}
        <p className="mt-6 text-[12px] text-ink-3">
          Alerts stay on this screen only while you&apos;re signed in, and
          they&apos;re never printed or exported.
        </p>
      </div>
      <p className="hidden print:block">Patient alerts aren&apos;t printed.</p>
    </>
  );
}
