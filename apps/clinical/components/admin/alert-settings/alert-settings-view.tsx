"use client";
import { useCallback, useRef, useState } from "react";
import { adminError } from "@/lib/admin/errors";
import { useAlertSettings } from "@/lib/emr-queries";
import { eventClock } from "@/lib/time";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { useNow } from "@mhai/ui/hooks/use-now";
import { UnsavedGuard } from "../../states/unsaved-guard";
import { AdminFrame } from "../admin-frame";
import { RecipientsSection } from "./recipients-section";
import { RecordsStatusSection } from "./records-status";
import { RulesSection } from "./rules-section";
import { UnitsSection } from "./units-section";

const INTRO =
  "Choose which units MHAI watches, what it flags and who hears about it. Alerts go to clinicians only, never to patients.";

/** Alert settings for hospital admins: units, what to flag, who hears. */
export function AlertSettingsView() {
  const q = useAlertSettings();
  const now = useNow(60_000);
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  // Changing the key starts every section afresh (Discard on leaving).
  const [epoch, setEpoch] = useState(0);
  const mark = useRef<Record<string, (d: boolean) => void>>({});
  const marker = (name: string) =>
    (mark.current[name] ??= (d: boolean) =>
      setDirty((s) => {
        if (s.has(name) === d) return s;
        const next = new Set(s);
        if (d) next.add(name);
        else next.delete(name);
        return next;
      }));
  const onUnits = useCallback((d: boolean) => marker("units")(d), []);
  const onRules = useCallback((d: boolean) => marker("rules")(d), []);
  const onRecipients = useCallback((d: boolean) => marker("recipients")(d), []);

  const failed = q.isError && !q.data ? adminError(q.error) : null;
  const data = q.data;
  return (
    <AdminFrame title="Alert settings">
      <div className="flex max-w-[760px] flex-col gap-4">
        <p className="text-[14px] text-ink-2">{INTRO}</p>
        {failed && (
          <Banner tone="bad" title="Couldn't load alert settings">
            {failed.body}
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </span>
          </Banner>
        )}
        {!data &&
          !failed &&
          (q.fetchStatus === "paused" ? (
            <div
              role="status"
              className="card-v3 p-6 text-center text-[14px] text-ink-2"
            >
              You&apos;re offline. This needs a connection.
            </div>
          ) : (
            <Skeleton className="h-96 rounded-2xl" />
          ))}
        {data && (
          <div key={epoch} className="flex flex-col gap-4">
            <RecordsStatusSection connection={data.connection} now={now} />
            <UnitsSection data={data} onDirty={onUnits} />
            <RulesSection data={data} onDirty={onRules} />
            <RecipientsSection data={data} onDirty={onRecipients} />
            {data.updated_by && (
              <p className="text-[12.5px] text-ink-3">
                Last changed by {data.updated_by.display_name}
                {data.updated_at
                  ? ` · ${eventClock(data.updated_at, now)}`
                  : ""}
              </p>
            )}
          </div>
        )}
      </div>
      <UnsavedGuard
        dirty={dirty.size > 0}
        onDiscard={() => {
          setDirty(new Set());
          setEpoch((n) => n + 1);
        }}
        title="Leave without saving?"
        body="Your changes to the alert settings will be lost."
      />
    </AdminFrame>
  );
}
