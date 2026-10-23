"use client";
import Link from "next/link";
import { actionLabel, formatWhen } from "@/lib/activity-labels";
import { useActivityFeed } from "@/lib/queries/activity";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { Section } from "./section";

const SHOWN = 5;

/** The latest few things done to this hospital, with a way to see them all. */
export function RecentActions({ hospitalId }: { hospitalId: string }) {
  const q = useActivityFeed({ hospital: hospitalId });
  const events = q.data?.pages[0]?.events.slice(0, SHOWN) ?? [];
  return (
    <Section
      title="Recent actions"
      action={
        <Link
          href={`/activity?hospital=${encodeURIComponent(hospitalId)}`}
          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-mint-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep sm:min-h-9"
        >
          See all
        </Link>
      }
    >
      {q.isError && !q.data ? (
        <CouldntLoad what="recent actions" onRetry={() => void q.refetch()} />
      ) : q.isPending ? (
        <Loading label="Loading recent actions" />
      ) : events.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">Nothing done here yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <li key={e.id} className="py-2.5 text-[13.5px]">
              <p className="[overflow-wrap:anywhere]">
                <strong className="font-semibold">{e.actor.name}</strong>{" "}
                {actionLabel(e.action, e.target, e.reason)}
                {" · "}
                <time dateTime={e.at}>{formatWhen(e.at)}</time>
              </p>
              {e.detail && (
                <p className="mt-0.5 text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
                  {e.detail}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
