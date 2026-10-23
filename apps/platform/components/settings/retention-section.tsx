"use client";
import { useState, type ReactNode } from "react";
import type { ApiError } from "@mhai/api-client/errors";
import type {
  RetentionItem,
  RetentionType,
  SettingsOut,
} from "@/lib/api/settings-contract";
import { isPlatformAdmin, useAuth } from "@/lib/auth/auth-context";
import { platformError } from "@/lib/errors";
import { dateLabel } from "@/lib/format";
import { useRefreshSettings } from "@/lib/queries/settings";
import { retentionIsKnown, retentionTypeLabel } from "@/lib/settings/labels";
import { daysLabel } from "@/lib/settings/rules";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Section } from "../hospitals/section";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { ChangedLine } from "./changed-line";
import { PauseCleanUp } from "./pause-clean-up";
import { RetentionChangeDialog } from "./retention-change-dialog";
import { SectionFailed } from "./section-failed";

export const RETENTION_TITLE = "Records retention";
export const RETENTION_WHAT = "records retention";
export const NOT_CONFIRMED =
  "These periods are not yet confirmed by Measured Health's compliance lead.";

const HEADERS = ["How long", "Minimum", "Last clean-up", "Next"];

/** "{date} · {n} deleted · {n} kept for legal holds · finished". */
function lastLine(l: RetentionItem["last_run"]): string {
  if (!l) return "Not run yet";
  return `${dateLabel(l.at)} · ${l.deleted} deleted · ${l.kept_for_holds} kept for legal holds · ${l.ok ? "finished" : "didn't finish"}`;
}
const nextLine = (at: string | null) => (at ? dateLabel(at) : "Not scheduled");

/**
 * How long each type of record is kept, the least the server allows, and
 * the daily clean-up's last and next run. Platform admins change a period
 * (shorter needs a second admin); auditors read it all and change nothing.
 */
export function RetentionSection({ settings }: { settings: SettingsOut }) {
  const { user } = useAuth();
  const canAct = isPlatformAdmin(user);
  const desktop = useIsDesktop();
  const refresh = useRefreshSettings();
  const net = useNeedsConnection("retention-offline");
  const [changing, setChanging] = useState<RetentionType | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const r = settings.retention;

  // A type this app has no words for fails the section, never printed raw.
  if (!r.items.every(retentionIsKnown))
    return (
      <SectionFailed
        title={RETENTION_TITLE}
        what={RETENTION_WHAT}
        onRetry={() => void refresh()}
      />
    );

  /** A shorter period waiting for a second admin, if any. */
  const waitingTo = (t: RetentionType) => {
    const p = settings.pending.find(
      (x) => x.kind === "retention_shorten" && x.type === t,
    );
    return p?.kind === "retention_shorten" ? p.to : null;
  };
  const refused = (e: ApiError) => {
    setRefusal(platformError(e).title);
    void refresh();
  };
  const action = (i: RetentionItem): ReactNode => {
    const to = waitingTo(i.type);
    if (to !== null)
      return (
        <p className="text-[13px] text-ink-2">
          Change to {daysLabel(to)} waiting for a different platform admin
        </p>
      );
    if (!canAct) return null;
    return (
      <Button
        size="sm"
        variant="ghost"
        {...net.props}
        onClick={() => {
          setRefusal(null);
          setChanging(i.type);
        }}
      >
        Change
      </Button>
    );
  };
  const changingItem = r.items.find((i) => i.type === changing);

  return (
    <Section title={RETENTION_TITLE}>
      {!r.confirmed && (
        <p className="mb-3 text-[13.5px] text-ink-2">{NOT_CONFIRMED}</p>
      )}
      <PauseCleanUp settings={settings} />
      {refusal && (
        <div className="mb-3">
          <Banner tone="bad" title={refusal} />
        </div>
      )}
      {desktop ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <caption className="sr-only">{RETENTION_TITLE}</caption>
            <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  What&apos;s kept
                </th>
                {HEADERS.map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-semibold">
                    {h}
                  </th>
                ))}
                <th scope="col" className="py-2 font-semibold">
                  <span className="sr-only">Change</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.type} className="border-t border-line align-top">
                  <th scope="row" className="py-3 pr-4 text-left font-normal">
                    <span className="font-semibold">
                      {retentionTypeLabel(i.type)}
                    </span>
                    <ChangedLine by={i.changed_by} at={i.changed_at} />
                  </th>
                  <td className="py-3 pr-4">{daysLabel(i.days)}</td>
                  <td className="py-3 pr-4">{daysLabel(i.minimum_days)}</td>
                  <td className="py-3 pr-4">{lastLine(i.last_run)}</td>
                  <td className="py-3 pr-4">{nextLine(i.next_run_at)}</td>
                  <td className="py-3 text-right">{action(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {r.items.map((i) => (
            <li
              key={i.type}
              className="rounded-xl border border-line px-4 py-3"
            >
              <h3 className="text-[14px] font-semibold">
                {retentionTypeLabel(i.type)}
              </h3>
              <ChangedLine by={i.changed_by} at={i.changed_at} />
              <dl className="mt-2 grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-ink-3">How long</dt>
                <dd>{daysLabel(i.days)}</dd>
                <dt className="text-ink-3">Minimum</dt>
                <dd>{daysLabel(i.minimum_days)}</dd>
                <dt className="text-ink-3">Last clean-up</dt>
                <dd>{lastLine(i.last_run)}</dd>
                <dt className="text-ink-3">Next</dt>
                <dd>{nextLine(i.next_run_at)}</dd>
              </dl>
              <div className="mt-2">{action(i)}</div>
            </li>
          ))}
        </ul>
      )}
      {canAct && <OfflineNote id="retention-offline" />}
      {canAct && changingItem && (
        <RetentionChangeDialog
          item={changingItem}
          open
          onClose={() => setChanging(null)}
          onRefused={refused}
        />
      )}
    </Section>
  );
}
