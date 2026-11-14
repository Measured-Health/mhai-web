"use client";
import { useId } from "react";
import type {
  GuardedOut,
  UsageAlertsOut,
  UsageOut,
} from "@/lib/api/admin-contract";
import {
  ALERTS_FAILED,
  ALERTS_INTRO,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  HANDLING_LABEL,
  HANDLING_ORDER,
  ROUTE_LABEL,
  ROUTE_ORDER,
  SEVERITY_ORDER,
  readAlerts,
  shown,
  valueText,
} from "@/lib/admin/alert-usage";
import { SEVERITY } from "@/lib/notifications/alert-view";
import { SEVERITY_ICON } from "../notifications/chips";
import type { BarItem } from "@mhai/ui/charts/types";
import { BarList } from "@mhai/ui/charts/bar-list";
import { Card, RetryBanner, Tile } from "./usage-parts";

function AlertTile({
  label,
  icon: TileIcon,
  g,
}: {
  label: string;
  icon?: (typeof SEVERITY_ICON)[keyof typeof SEVERITY_ICON];
  g: GuardedOut;
}) {
  const s = shown(g);
  return (
    <Tile
      label={label}
      value={valueText(s)}
      muted={s.kind !== "value"}
      icon={TileIcon && <TileIcon aria-hidden className="size-3.5 shrink-0" />}
    />
  );
}

/** A hidden count is the words "Fewer than 5", never a bar or a zero. */
const barItem = (key: string, label: string, g: GuardedOut): BarItem => {
  const s = shown(g);
  return {
    key,
    label,
    value: s.kind === "value" ? s.value : null,
    text: valueText(s),
    hidden: s.kind === "hidden",
  };
};

function AlertsBody({ a }: { a: UsageAlertsOut }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <AlertTile label="Alerts" g={a.total} />
        {SEVERITY_ORDER.map((k) => (
          <AlertTile
            key={k}
            label={SEVERITY[k].label}
            icon={SEVERITY_ICON[k]}
            g={a.by_severity[k]}
          />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="What happened to them" level={4}>
          <BarList
            items={HANDLING_ORDER.map((k) =>
              barItem(k, HANDLING_LABEL[k], a.by_handling[k]),
            )}
          />
        </Card>
        <Card title="Who received them" level={4}>
          <BarList
            items={ROUTE_ORDER.map((k) =>
              barItem(k, ROUTE_LABEL[k], a.by_route[k]),
            )}
          />
          <p className="mt-2 text-[12px] text-ink-3">
            One alert can go to both, so these can add up to more than the
            total.
          </p>
        </Card>
      </div>
      <Card title="By kind of result" level={4}>
        <BarList
          items={CATEGORY_ORDER.map((k) =>
            barItem(k, CATEGORY_LABEL[k], a.by_category[k]),
          )}
        />
      </Card>
    </>
  );
}

/**
 * The Patient alerts group on Usage, as core sends it (1.24.0). Hidden when
 * the hospital has no record source; says so, never zeros, when the
 * numbers couldn't load or could give a hidden group away (R1, R2).
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
        <AlertsBody a={s.alerts} />
      )}
    </section>
  );
}
