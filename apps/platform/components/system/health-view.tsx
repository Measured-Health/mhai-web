"use client";
import { useIsFetching } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { readHealth, timeLabel, waitLabel, type Block } from "@/lib/ops/health";
import { healthKey, useHealth, useRefreshHealth } from "@/lib/queries/ops";
import { Button } from "@mhai/ui/button";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { DemoHealthSwitch } from "./demo-health-switch";
import { ErrorsBlock } from "./errors-block";
import { OverallStatus } from "./overall-status";
import { PartsList } from "./parts-list";
import { TimingBlock } from "./timing-block";
import { VersionsBlock } from "./versions-block";

/** Date.now(), refreshed every 15 s, so an old reading ages without a fetch. */
function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function Section<T>({
  title,
  what,
  block,
  onRetry,
  children,
}: {
  title: string;
  what: string;
  block: Block<T>;
  onRetry(): void;
  children(value: T): ReactNode;
}) {
  return (
    <section aria-label={title} className="card-v3 px-[22px] py-5">
      <h2 className="mb-2 text-[15px] font-semibold">{title}</h2>
      {block.status === "ok" ? (
        children(block.value)
      ) : (
        <CouldntLoad what={what} onRetry={onRetry} />
      )}
    </section>
  );
}

/**
 * The Health tab: the whole system in one line, then the parts, the queue,
 * failed jobs, answer times, recent errors and versions. Each block fails on
 * its own; a reading that is old or missing shows Couldn't check and no
 * figures at all.
 */
export function HealthView() {
  const q = useHealth();
  const refresh = useRefreshHealth();
  const net = useNeedsConnection("health-offline");
  const fetching = useIsFetching({ queryKey: healthKey }) > 0;
  const tick = useNow();
  // A fetch landing between ticks is never older than the tick.
  const now = Math.max(tick, q.dataUpdatedAt);

  if (q.isPending) return <Loading label="Loading system health" />;
  const state = readHealth(q.data, { failed: q.isError, now });
  const retry = () => void q.refetch();
  const { blocks } = state;
  // Something can be shown while any block reads. An unknown overall value
  // fails the overall line alone.
  const checked = Object.values(blocks).some((b) => b.status === "ok");

  return (
    <div className="flex flex-col gap-4">
      <DemoHealthSwitch />
      <section aria-label="Overall" className="card-v3 px-[22px] py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <OverallStatus state={state} now={now} unread={!checked} />
          <div className="flex flex-wrap items-center gap-3">
            {checked && state.lastGood && (
              <span className="text-[13px] text-ink-3">
                Updated {timeLabel(state.lastGood, now)}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 px-4"
              disabled={fetching || net.offline}
              {...(net.offline ? net.props : {})}
              onClick={() => void refresh()}
            >
              Refresh now
            </Button>
          </div>
        </div>
        <OfflineNote id="health-offline" />
      </section>

      {!checked ? (
        <CouldntLoad what="the health details" onRetry={retry} />
      ) : (
        <>
          <Section
            title="Parts of the system"
            what="the parts of the system"
            block={blocks.parts}
            onRetry={retry}
          >
            {(v) => <PartsList value={v} now={now} />}
          </Section>
          <Section
            title="Questions waiting"
            what="the questions waiting"
            block={blocks.queue}
            onRetry={retry}
          >
            {(v) => (
              <p className="text-[14px]">
                Questions waiting: {v.waiting}
                {v.oldest_wait_s !== null &&
                  ` · oldest ${waitLabel(v.oldest_wait_s)}`}
              </p>
            )}
          </Section>
          <Section
            title="Failed jobs"
            what="the failed jobs"
            block={blocks.failedJobs}
            onRetry={retry}
          >
            {(v) => (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[14px]">
                  Failed jobs: {v.now} · {v.last_24h} new in the last 24 hours
                </p>
                <Link
                  href="/system/jobs"
                  className="inline-flex min-h-11 items-center text-[14px] font-semibold text-mint-deep underline focus-visible:outline-2 focus-visible:outline-mint-deep"
                >
                  View failed jobs
                </Link>
              </div>
            )}
          </Section>
          <Section
            title="Answer times"
            what="the answer times"
            block={blocks.timing}
            onRetry={retry}
          >
            {(v) => <TimingBlock value={v} />}
          </Section>
          <Section
            title="Recent errors"
            what="the recent errors"
            block={blocks.errors}
            onRetry={retry}
          >
            {(v) => <ErrorsBlock value={v} />}
          </Section>
          <section aria-label="Versions" className="card-v3 px-[22px] py-2">
            {blocks.versions.status === "ok" ? (
              <VersionsBlock value={blocks.versions.value} />
            ) : (
              <div className="py-3">
                <CouldntLoad what="the versions" onRetry={retry} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
