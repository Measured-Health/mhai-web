"use client";
import { useId, useState } from "react";
import type { CorrectionOut, CorrectionStatus } from "@/lib/api/contract";
import { useMyCorrections } from "@/lib/correction-queries";
import {
  correctionTitle,
  isOverdue,
  rejectionText,
  statusLine,
} from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { useNetwork } from "@/lib/network";
import { CorrectionCompare } from "../review/correction-compare";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { FilterChip } from "./filter-chip";
import { OverdueChip, StatusChip } from "./chips";
import { ResubmitDialog } from "./resubmit-dialog";
import { useWithdrawFlow } from "./withdraw-dialog";

type Filter = "all" | CorrectionStatus;

/** Your corrections and what the reviewers decided (states-and-export 7). */
export function MyCorrectionsView() {
  const q = useMyCorrections();
  const { online } = useNetwork();
  const now = useNow(60_000);
  const flow = useWithdrawFlow();
  const offlineId = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [resubmitFor, setResubmitFor] = useState<CorrectionOut | null>(null);

  const list = q.data ?? [];
  const count = (s: CorrectionStatus) =>
    list.filter((c) => c.status === s).length;
  const filters: [Filter, string][] = [
    ["all", `All · ${list.length}`],
    ["pending_review", `Waiting · ${count("pending_review")}`],
    ["approved", `Approved · ${count("approved")}`],
    ["rejected", `Rejected · ${count("rejected")}`],
  ];
  if (count("withdrawn"))
    filters.push(["withdrawn", `Withdrawn · ${count("withdrawn")}`]);
  const shown =
    filter === "all" ? list : list.filter((c) => c.status === filter);

  return (
    <>
      <TopBar
        title="My feedback & corrections"
        sub="Your account"
        leading={<MenuButton />}
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto max-w-[760px]">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Your account
          </p>
          <h2 className="font-display text-[40px] font-black leading-none">
            My feedback &amp; corrections
          </h2>
          <p className="mt-2 text-[13.5px] text-ink-2">
            Corrections you suggested, and what the reviewers decided.
          </p>
          {q.isPending ? (
            <div aria-busy="true" className="mt-5 flex flex-col gap-3">
              <span className="sr-only">Loading your corrections</span>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : !q.data ? (
            <div className="mt-5">
              <Banner tone="bad" title="Couldn't load your corrections">
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
          ) : list.length === 0 ? (
            <section className="card-v3 mt-5 px-[22px] py-6 text-[14px] text-ink-2">
              <h3 className="text-base font-semibold text-ink">
                No corrections yet
              </h3>
              <p className="mt-1">
                When you suggest a correction on a result, you can follow it
                here: waiting, approved or rejected, with the reviewer&apos;s
                reason.
              </p>
            </section>
          ) : (
            <>
              <div
                role="group"
                aria-label="Show"
                className="mb-4 mt-4 flex flex-wrap gap-1.5"
              >
                {filters.map(([f, label]) => (
                  <FilterChip
                    key={f}
                    pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {label}
                  </FilterChip>
                ))}
              </div>
              {!online && (
                <p id={offlineId} className="mb-3 text-[13px] text-ink-3">
                  You&apos;re offline. Withdrawing needs a connection.
                </p>
              )}
              <ul aria-label="Your corrections" className="card-v3 px-5 py-1.5">
                {shown.map((c) => {
                  const title = correctionTitle(c);
                  const reason = rejectionText(c.rejection);
                  const expanded = openId === c.id;
                  const panelId = `${offlineId}-${c.id}`;
                  return (
                    <li
                      key={c.id}
                      className="border-t border-line py-3.5 first:border-0"
                    >
                      <div className="flex flex-wrap items-start gap-3.5">
                        <StatusChip status={c.status} />
                        <div className="min-w-0 flex-1">
                          <b className="block [overflow-wrap:anywhere]">
                            {title}
                          </b>
                          <p className="text-[13px] text-ink-3">
                            {statusLine(c, now)}
                          </p>
                          {isOverdue(c, now) && (
                            <span className="mt-1 inline-block">
                              <OverdueChip />
                            </span>
                          )}
                          {reason && (
                            <p className="mt-1.5 rounded-xl bg-bad-wash px-3 py-2 text-[13px] text-bad-deep [overflow-wrap:anywhere]">
                              <span className="font-semibold">
                                Reviewer&apos;s reason:{" "}
                              </span>
                              “{reason}”
                            </p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded}
                            aria-controls={panelId}
                            onClick={() => setOpenId(expanded ? null : c.id)}
                          >
                            {expanded ? "Hide" : "View"}
                            <span className="sr-only">: {title}</span>
                          </Button>
                          {c.status === "pending_review" && (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={!online}
                              aria-describedby={online ? undefined : offlineId}
                              onClick={() => flow.ask(c.id)}
                            >
                              Withdraw<span className="sr-only">: {title}</span>
                            </Button>
                          )}
                          {c.status === "rejected" && (
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => setResubmitFor(c)}
                            >
                              Resubmit<span className="sr-only">: {title}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                      {expanded && (
                        <div id={panelId} className="mt-3.5">
                          <CorrectionCompare c={c} mine />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
      {flow.dialog}
      <ResubmitDialog
        correction={resubmitFor}
        onClose={() => setResubmitFor(null)}
      />
    </>
  );
}
