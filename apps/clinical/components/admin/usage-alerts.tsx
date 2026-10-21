"use client";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import { useId } from "react";
import type {
  ChangeOut,
  GuardedOut,
  MeasureOut,
  UsageAlertsOut,
  UsageOut,
  UsagePeriod,
} from "@/lib/api/admin-contract";
import {
  ALERTS_FAILED,
  ALERTS_INTRO,
  NOT_ENOUGH_TO_COMPARE,
  NOTHING_UNUSUAL,
  SEVERITY_ORDER,
  TOP_MAX,
  UNUSUALLY_BUSY,
  alertCount,
  changeFor,
  changeText,
  columnsOf,
  criticalTargetLabel,
  findingLabel,
  placeLabel,
  readAlerts,
  seriesSummary,
  shown,
  shownDirection,
  valueText,
  verdict,
  whatChanged,
  type Better,
  type ChangeItem,
  type MeasureKind,
} from "@/lib/admin/alert-usage";
import { DISMISS_REASONS, SEVERITY } from "@/lib/notifications/alert-view";
import { SEVERITY_ICON } from "../notifications/chips";
import type { BarItem } from "@/lib/charts";
import { BarList } from "../ui/charts/bar-list";
import { ColumnChart } from "../ui/charts/column-chart";
import { cn } from "@mhai/ui/cn";
import { Card, RetryBanner, Tile } from "./usage-parts";

type Icon = typeof ArrowUp;

/** "up 6 min vs last month · worse", with its arrow; the word carries it, not the colour. */
function ChangeLine({
  c,
  kind,
  better = null,
  period,
}: {
  c: ChangeOut;
  kind: MeasureKind;
  better?: Better;
  period: UsagePeriod;
}) {
  // One shown direction for the arrow, the words and the verdict.
  const d = shownDirection(c);
  const v = verdict(c, better);
  const Arrow = d === "up" ? ArrowUp : d === "down" ? ArrowDown : ArrowRight;
  return (
    <span
      className={cn(
        "mt-1.5 flex items-center gap-1 text-[12px] [overflow-wrap:anywhere]",
        v === "worse"
          ? "text-bad-deep"
          : v === "better"
            ? "text-ok-deep"
            : "text-ink-2",
      )}
    >
      <Arrow aria-hidden className="size-3.5 shrink-0" />
      {changeText(c, kind, period)}
      {v && ` · ${v}`}
    </span>
  );
}

function AlertTile({
  label,
  icon: TileIcon,
  m,
  kind,
  better = null,
  period,
  hasPrevious,
}: {
  label: string;
  icon?: Icon;
  m: MeasureOut;
  kind: MeasureKind;
  better?: Better;
  period: UsagePeriod;
  hasPrevious: boolean;
}) {
  const s = shown(m, kind);
  const c = changeFor(m, kind, hasPrevious);
  return (
    <Tile
      label={label}
      value={valueText(s, kind)}
      muted={s.kind !== "value"}
      icon={TileIcon && <TileIcon aria-hidden className="size-3.5 shrink-0" />}
      footer={
        c && <ChangeLine c={c} kind={kind} better={better} period={period} />
      }
    />
  );
}

const barItem = (
  key: string,
  label: string,
  g: GuardedOut | undefined,
  kind: MeasureKind,
  note?: string | null,
): BarItem => {
  const s = shown(g, kind);
  return {
    key,
    label,
    value: s.kind === "value" ? s.value : null,
    text: valueText(s, kind),
    hidden: s.kind === "hidden",
    note,
  };
};

const CHANGE_ICON: Record<ChangeItem["kind"], { Icon: Icon; tone: string }> = {
  worse: { Icon: TriangleAlert, tone: "text-bad-deep" },
  busy: { Icon: CalendarDays, tone: "text-warn-deep" },
  rising: { Icon: TrendingUp, tone: "text-ink-2" },
};

function WhatChangedCard({ a }: { a: UsageAlertsOut }) {
  const w = whatChanged(a);
  return (
    <Card title="What changed" level={4}>
      {w.kind === "items" ? (
        <ul className="flex flex-col gap-2">
          {w.items.map((i) => {
            const { Icon, tone } = CHANGE_ICON[i.kind];
            return (
              <li key={i.key} className="flex items-start gap-2 text-[13px]">
                <Icon
                  aria-hidden
                  className={cn("mt-0.5 size-4 shrink-0", tone)}
                />
                <span className="[overflow-wrap:anywhere]">{i.text}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          {w.kind === "nothing" ? (
            <CheckCircle2 aria-hidden className="size-4 text-ok-deep" />
          ) : (
            <CircleHelp aria-hidden className="size-4" />
          )}
          {w.kind === "nothing" ? NOTHING_UNUSUAL : NOT_ENOUGH_TO_COMPARE}
        </p>
      )}
    </Card>
  );
}

function AlertsBody({ a, period }: { a: UsageAlertsOut; period: UsagePeriod }) {
  const common = { period, hasPrevious: a.has_previous };
  const outcome = (m: MeasureOut) => {
    const c = changeFor(m, "share", a.has_previous);
    return c ? changeText(c, "share", period) : null;
  };
  return (
    <>
      <WhatChangedCard a={a} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <AlertTile label="Alerts" m={a.total} kind="count" {...common} />
        {SEVERITY_ORDER.map((k) => (
          <AlertTile
            key={k}
            label={SEVERITY[k].label}
            icon={SEVERITY_ICON[k]}
            m={a.by_severity[k]}
            kind="count"
            {...common}
          />
        ))}
        <AlertTile
          label="Still unhandled"
          m={a.unhandled}
          kind="count"
          {...common}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <AlertTile
          label="Median time to acknowledge"
          m={a.median_ack_minutes}
          kind="minutes"
          better="lower"
          {...common}
        />
        <AlertTile
          label="Median for Critical alerts"
          m={a.median_ack_minutes_critical}
          kind="minutes"
          better="lower"
          {...common}
        />
        <AlertTile
          label={criticalTargetLabel(a.critical_target_minutes)}
          m={a.critical_within_target}
          kind="share"
          better="higher"
          {...common}
        />
      </div>
      <ColumnChart
        title="Alerts over time"
        level={4}
        columns={columnsOf(a)}
        summary={seriesSummary(a.series)}
        valueText={alertCount}
        headers={[a.series.bucket === "week" ? "Week" : "Day", "Alerts"]}
        markLegend={UNUSUALLY_BUSY}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Outcomes" level={4}>
          <BarList
            max={1}
            items={[
              barItem(
                "ack",
                "Acknowledged",
                a.acknowledged_share,
                "share",
                outcome(a.acknowledged_share),
              ),
              barItem(
                "dismissed",
                "Dismissed",
                a.dismissed_share,
                "share",
                outcome(a.dismissed_share),
              ),
            ]}
          />
        </Card>
        <Card title="Dismissal reasons" level={4}>
          <BarList
            items={DISMISS_REASONS.map((r) =>
              barItem(
                r.code,
                r.label,
                a.dismiss_reasons.find((x) => x.reason === r.code)?.count,
                "count",
              ),
            )}
          />
        </Card>
        <Card title="Top findings" level={4}>
          <BarList
            items={a.top_findings
              .slice(0, TOP_MAX)
              .map((f, i) =>
                barItem(`f${i}`, findingLabel(f), f.count, "count"),
              )}
          />
        </Card>
        <Card title="Top locations" level={4}>
          <BarList
            items={a.top_locations
              .slice(0, TOP_MAX)
              .map((l, i) =>
                barItem(`l${i}`, placeLabel(l.location), l.count, "count"),
              )}
          />
        </Card>
      </div>
    </>
  );
}

/**
 * The Patient alerts group on Usage (Plan 5b). Hidden when alerts are off;
 * says so, never zeros or "Nothing unusual", when they couldn't load (R1, R2).
 */
export function UsageAlerts({
  usage,
  onRetry,
}: {
  usage: UsageOut;
  onRetry: () => void;
}) {
  const id = useId();
  const s = readAlerts(usage);
  if (s.state === "off") return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div>
        <h3
          id={id}
          className="font-display text-[22px] font-black leading-tight"
        >
          Patient alerts
        </h3>
        <p className="mt-1 text-[12.5px] text-ink-3">{ALERTS_INTRO}</p>
      </div>
      {s.state === "failed" ? (
        <RetryBanner title={ALERTS_FAILED} onRetry={onRetry}>
          The other usage numbers are up to date. Try again in a moment.
        </RetryBanner>
      ) : (
        <AlertsBody a={s.alerts} period={usage.period} />
      )}
    </section>
  );
}
