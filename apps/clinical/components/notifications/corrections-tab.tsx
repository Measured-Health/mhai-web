"use client";
import { Sparkle } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useMyCorrections } from "@/lib/correction-queries";
import {
  correctionTitle,
  parseTime,
  rejectionText,
  statusLine,
} from "@/lib/corrections";
import { useNow } from "@mhai/ui/hooks/use-now";
import { StatusChip } from "../corrections/chips";
import { ReviewerReason } from "../corrections/reviewer-reason";
import { useDecisions } from "../corrections/decisions-provider";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";
import { Skeleton } from "@mhai/ui/skeleton";
import { NotificationsFrame } from "./notifications-frame";

/** The Corrections tab: what reviewers decided (spec §2). Looking here counts decisions as seen (R1). */
export function CorrectionsTab() {
  const q = useMyCorrections();
  const d = useDecisions();
  const now = useNow(60_000);
  // A retry after a failed first load goes back to "pending"; keep the error up.
  const unseen = d?.unseen ?? 0;
  const markSeen = d?.markSeen;
  useEffect(() => {
    if (unseen) markSeen?.();
  }, [unseen, markSeen]);
  const fresh = new Set((d?.notes ?? []).map((n) => n.id));
  const decided = (q.data ?? [])
    .filter((c) => c.status === "approved" || c.status === "rejected")
    .sort(
      (x, y) => (parseTime(y.decided_at) ?? 0) - (parseTime(x.decided_at) ?? 0),
    );

  return (
    <NotificationsFrame current="corrections">
      <p className="mb-3 text-[13.5px] text-ink-2">
        What reviewers decided about corrections you suggested.
      </p>
      {q.isPending && q.fetchStatus === "paused" ? (
        <p className="text-[13.5px] text-ink-3">
          You&apos;re offline. Your decisions will load when you reconnect.
        </p>
      ) : q.isPending && !q.errorUpdateCount ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">Loading decisions</span>
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : !q.data ? (
        <div>
          <Banner tone="bad" title="Couldn't load your decisions">
            Check your connection and try again.
          </Banner>
          <Button
            variant="ghost"
            className="mt-3"
            disabled={q.isFetching}
            onClick={() => void q.refetch()}
          >
            {q.isFetching ? "Trying again…" : "Try again"}
          </Button>
        </div>
      ) : decided.length === 0 ? (
        <p className="text-[13.5px] text-ink-3">
          No decisions yet. When a reviewer approves or rejects a correction you
          suggested, it shows here.
        </p>
      ) : (
        <ul
          aria-label="Decisions on your corrections"
          className="card-v3 px-5 py-1.5"
        >
          {decided.map((c) => {
            const reason = rejectionText(c.rejection);
            return (
              <li
                key={c.id}
                className="border-t border-line py-3.5 first:border-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={c.status} />
                  {fresh.has(c.id) && (
                    <Chip tone="mint">
                      <Sparkle aria-hidden className="size-3" />
                      New
                    </Chip>
                  )}
                </div>
                <b className="mt-1.5 block [overflow-wrap:anywhere]">
                  {correctionTitle(c)}
                </b>
                <p className="text-[13px] text-ink-3">{statusLine(c, now)}</p>
                {reason && <ReviewerReason reason={reason} />}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/my-feedback"
        className="mt-4 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-mint-deep focus-visible:outline-2 focus-visible:outline-mint-deep"
      >
        My feedback &amp; corrections ›
      </Link>
    </NotificationsFrame>
  );
}
