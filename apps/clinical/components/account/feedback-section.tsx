"use client";
import Link from "next/link";
import { useFeedbackStats } from "@/lib/correction-queries";
import { Skeleton } from "../ui/skeleton";

/** Feedback stats on Profile & security (spec §5.5, account.html 5). */
export function FeedbackSection() {
  const q = useFeedbackStats();
  const s = q.data;
  const counts: [string, number][] = s
    ? [
        ["Results agreed", s.agreed],
        ["Corrections waiting", s.corrections_waiting],
        ["Corrections approved", s.corrections_approved],
        ["Corrections rejected", s.corrections_rejected],
      ]
    : [];
  return (
    <section
      id="feedback"
      aria-labelledby="feedback-h"
      className="card-v3 scroll-mt-4 px-[22px] py-5"
    >
      <h2 id="feedback-h" className="text-base font-semibold">
        My feedback
      </h2>
      <p className="mb-3.5 mt-1 text-[13px] text-ink-3">
        How your reviews help improve the system.
      </p>
      {q.isPending ? (
        <Skeleton className="h-[74px]" />
      ) : !s ? (
        <p className="text-[13px] text-ink-3">
          Your feedback numbers aren&apos;t available right now.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {counts.map(([label, n]) => (
            <div
              key={label}
              className="flex flex-col-reverse rounded-2xl bg-lilac px-3.5 py-3"
            >
              <dt className="mt-1 text-[12px] text-ink-2">{label}</dt>
              <dd className="tabular font-display text-[30px] font-black leading-none text-bloom">
                {n}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <Link
        href="/my-feedback"
        className="mt-4 inline-flex min-h-11 items-center text-[13.5px] font-semibold text-mint-deep"
      >
        See my feedback &amp; corrections ›
      </Link>
    </section>
  );
}
