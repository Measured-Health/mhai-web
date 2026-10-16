"use client";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { useId, useState, type Ref } from "react";
import {
  ageLabel,
  correctionTitle,
  isOverdue,
  parseTime,
  type QueueItem,
} from "@/lib/corrections";
import { OriginalChip } from "../corrections/chips";
import { Avatar } from "../shell/account-menu";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { ConsultationDialog } from "./consultation-dialog";
import { CorrectionCompare } from "./correction-compare";

/** The right column (desktop) or the compare screen (phones). */
export function ReviewDetail({
  item,
  now,
  position,
  gone,
  online,
  busy,
  onApprove,
  onReject,
  onSkip,
  onWithdraw,
  onBack,
  onNext,
  approveRef,
}: {
  item: QueueItem;
  now: number;
  /** "1 of 3" on phones; null when the item has left the list. */
  position: { index: number; total: number } | null;
  /** Decided elsewhere while you were looking (Review Focus 1). */
  gone: boolean;
  online: boolean;
  busy: boolean;
  onApprove(): void;
  onReject(): void;
  onSkip(): void;
  onWithdraw(): void;
  onBack(): void;
  onNext(): void;
  approveRef?: Ref<HTMLButtonElement>;
}) {
  const { c, mine } = item;
  const [consultOpen, setConsultOpen] = useState(false);
  const id = useId();
  const submitted = parseTime(c.submitted_at);
  const age = submitted === null ? null : ageLabel(submitted, now);
  const hours =
    submitted === null ? null : Math.floor((now - submitted) / 3_600_000);
  const person = c.submitted_by;
  const decidable = !mine && !gone && online && !busy;
  // Disabled buttons are described by the text that says why.
  const why = gone
    ? `${id}-gone`
    : mine
      ? `${id}-own`
      : !online
        ? `${id}-offline`
        : undefined;
  const withdrawWhy = gone
    ? `${id}-gone`
    : !online
      ? `${id}-offline`
      : undefined;

  return (
    <article aria-labelledby={`${id}-title`} className="mx-auto max-w-[860px]">
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden className="size-4" />
          Back to the queue
        </Button>
        {position && (
          <span className="ml-auto font-mono text-[11.5px] text-ink-3">
            {position.index} of {position.total}
            {age && ` · ${age} ago`}
          </span>
        )}
      </div>
      <header className="mb-4 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
            Correction{age && ` · submitted ${age} ago`}
          </p>
          <h2
            id={`${id}-title`}
            className="mt-0.5 font-display text-[32px] font-black leading-none [overflow-wrap:anywhere] md:text-[36px]"
          >
            {correctionTitle(c)}
          </h2>
        </div>
        <OriginalChip original={c.original} prefix="Original: " />
      </header>
      <div className="mb-3.5 flex flex-wrap items-center gap-2.5 rounded-[14px] border border-line bg-white px-3 py-2.5 text-[13px] text-ink-2">
        <Avatar
          name={person.display_name}
          className="size-[30px] text-[11px]"
        />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {mine ? (
            <b>You suggested this</b>
          ) : (
            <>
              <b>{person.full_name ?? person.display_name}</b> suggested this
            </>
          )}
          {[person.specialty, person.hospital]
            .filter(Boolean)
            .map((s) => ` · ${s}`)
            .join("")}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setConsultOpen(true)}>
          Open consultation
          <ExternalLink aria-hidden className="size-3.5" />
        </Button>
      </div>
      {gone && (
        <div id={`${id}-gone`} className="mb-3.5">
          <Banner
            tone="warn"
            title="Another clinician has already decided this correction"
          >
            Nothing you do here will be sent.{" "}
            <button
              type="button"
              onClick={onNext}
              className="min-h-11 font-semibold underline sm:min-h-0"
            >
              Next correction
            </button>
          </Banner>
        </div>
      )}
      {!online && !gone && (
        <div id={`${id}-offline`} className="mb-3.5">
          <Banner tone="info" title="You're offline">
            Decisions need a connection. Approve, Reject and Withdraw come back
            when you&apos;re online.
          </Banner>
        </div>
      )}
      <CorrectionCompare c={c} mine={mine} />
      {mine && (
        <div
          id={`${id}-own`}
          className="mt-4 flex items-center gap-3 rounded-2xl bg-lilac px-4 py-3.5 text-[13.5px] text-bloom"
        >
          <Lock aria-hidden className="size-5 shrink-0" />
          <p>
            You can&apos;t review your own correction. Another clinician needs
            to approve it.
            {isOverdue(c, now) &&
              hours !== null &&
              ` It's been waiting ${hours} hours.`}
          </p>
        </div>
      )}
      <div
        role="group"
        aria-label="Decision"
        className="sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap items-center gap-2.5 border-t border-line bg-bg/95 px-4 py-3.5 max-md:fixed max-md:inset-x-0 max-md:mx-0 max-md:pb-[max(14px,env(safe-area-inset-bottom))] md:-mx-[26px] md:px-[26px]"
      >
        <Button
          ref={approveRef}
          variant="approve"
          aria-keyshortcuts="A"
          aria-describedby={why}
          disabled={!decidable}
          onClick={onApprove}
          className="max-md:order-2 max-md:flex-1"
        >
          <Check aria-hidden className="size-4" />
          Approve correction
        </Button>
        <Button
          variant="danger"
          aria-keyshortcuts="R"
          aria-describedby={why}
          disabled={!decidable}
          onClick={onReject}
          className="max-md:order-1 max-md:flex-1"
        >
          <X aria-hidden className="size-4" />
          Reject
        </Button>
        {mine ? (
          <Button
            variant="ghost"
            disabled={!online || gone || busy}
            aria-describedby={withdrawWhy}
            onClick={onWithdraw}
            className="max-md:order-3 max-md:w-full"
          >
            Withdraw my correction
          </Button>
        ) : (
          <Button variant="ghost" onClick={onSkip} className="max-md:hidden">
            Skip
          </Button>
        )}
        {!mine && (
          <span className="ml-auto hidden items-center gap-1.5 text-xs text-ink-3 lg:flex">
            <ShieldCheck aria-hidden className="size-3.5" />
            You are the second reviewer · A / R to decide
          </span>
        )}
      </div>
      <ConsultationDialog
        c={c}
        mine={mine}
        open={consultOpen}
        onClose={() => setConsultOpen(false)}
      />
    </article>
  );
}
