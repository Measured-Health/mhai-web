"use client";
import { CheckCircle2 } from "lucide-react";
import { useId } from "react";
import type { CorrectionOut } from "@/lib/api/contract";
import { useMyReviews } from "@/lib/correction-queries";
import { ageLabel, correctionTitle, parseTime } from "@/lib/corrections";
import { StatusChip } from "../corrections/chips";

export function RecentDecisions({
  items,
  now,
}: {
  items: CorrectionOut[];
  now: number;
}) {
  if (!items.length)
    return (
      <p className="px-4 py-3 text-[13px] text-ink-3">
        You haven&apos;t decided any corrections yet.
      </p>
    );
  return (
    <ul aria-label="Your recent decisions" className="flex flex-col">
      {items.map((c) => {
        const t = parseTime(c.decided_at);
        return (
          <li
            key={c.id}
            className="flex items-center gap-2.5 border-t border-line px-4 py-2.5 text-[13px] first:border-0"
          >
            <StatusChip status={c.status} />
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              {correctionTitle(c)}
            </span>
            {t !== null && (
              <small className="whitespace-nowrap text-ink-3">
                {ageLabel(t, now)} ago
              </small>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The empty queue is a reward, not a blank page (review-queue 5). */
export function AllCaughtUp({ now }: { now: number }) {
  const q = useMyReviews();
  const id = useId();
  const recent = (q.data ?? []).slice(0, 5);
  return (
    <div className="grid place-items-center px-4 py-10 text-center">
      <div className="w-full max-w-md">
        <span
          aria-hidden
          className="mx-auto mb-3.5 grid size-[76px] place-items-center rounded-3xl bg-ok-wash text-ok"
        >
          <CheckCircle2 className="size-9" />
        </span>
        <h2 className="font-display text-[36px] font-black leading-none">
          All caught up
        </h2>
        <p className="mt-2 text-[14px] text-ink-2">
          No corrections are waiting for you. New ones appear here, and the
          count shows in the sidebar.
        </p>
        {recent.length > 0 && (
          <section aria-labelledby={id} className="card-v3 mt-6 py-2 text-left">
            <h3 id={id} className="px-4 pt-2 text-[13px] font-semibold">
              Your recent decisions
            </h3>
            <RecentDecisions items={recent} now={now} />
          </section>
        )}
      </div>
    </div>
  );
}
