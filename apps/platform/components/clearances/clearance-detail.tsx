"use client";
import { Eye } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { REFUSED_TEXT, REJECT_LABEL, REVOKE_LABEL } from "@mhai/ui/clearances";
import { getPlatformClient } from "@/lib/api/client";
import type { Clearance, ClearanceEvent } from "@/lib/api/clearances-contract";
import { CHECKLIST, statusText } from "@/lib/clearances/labels";
import { instantDay } from "@/lib/clearances/switch";
import { useClearance } from "@/lib/queries/clearances";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { LetterViewer } from "@mhai/ui/letter-viewer";
import { Skeleton } from "@mhai/ui/skeleton";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";
import { safeDay, StatusWords } from "./clearance-queue";
import { VerifyActions } from "./verify-actions";

/** A reason code as words, or nothing for one this app doesn't know. */
const label = <K extends string>(
  words: Record<K, string>,
  code: string | null,
): string | null =>
  code !== null && Object.prototype.hasOwnProperty.call(words, code)
    ? words[code as K]
    : null;

const withReason = (what: string, reason: string | null) =>
  reason ? `${what}: ${reason}` : what;

/** What happened, in a few words. */
function what(e: ClearanceEvent): string {
  switch (e.kind) {
    case "uploaded":
      return "Uploaded";
    case "refused":
      return withReason(
        "Couldn't accept the file",
        label(REFUSED_TEXT, e.reason),
      );
    case "ready":
      return "Ready to check";
    case "verified":
      return "Verified";
    case "rejected":
      return withReason("Rejected", label(REJECT_LABEL, e.reason));
    case "narrowed":
      return "Removed people";
    case "revoked":
      return withReason("Revoked", label(REVOKE_LABEL, e.reason));
    case "ended":
      return "Ended";
    case "reminded":
      return "Reminder sent";
    default:
      return "Changed";
  }
}

/** Oldest first, whatever order they came in; an unreadable time goes last. */
const oldestFirst = (list: ClearanceEvent[]) => {
  const ms = (e: ClearanceEvent) => {
    const t = Date.parse(e.at);
    return Number.isNaN(t) ? Infinity : t;
  };
  return [...list].sort((a, b) => {
    const x = ms(a);
    const y = ms(b);
    return x === y ? 0 : x < y ? -1 : 1;
  });
};

/** "{day} · {what} · {who}", the day in the viewer's own zone. */
const historyLine = (e: ClearanceEvent) =>
  [instantDay(e.at) || "—", what(e), e.by?.name].filter(Boolean).join(" · ");

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] font-semibold text-ink-3">{term}</dt>
      <dd className="text-[14px] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function People({ title, names }: { title: string; names: string[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-1 text-[13px] font-semibold">
        {title}
      </h3>
      <ul aria-label={title} className="flex flex-col gap-1 text-[14px]">
        {names.map((n, i) => (
          <li key={`${n}-${i}`} className="[overflow-wrap:anywhere]">
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One letter: what the hospital entered, its history, the letter itself
 * (page images only, through `LetterViewer`), what to check, then Verify,
 * Reject and Revoke. Never put in the URL.
 */
export function ClearanceDetail({
  id,
  today,
}: {
  id: string;
  /** The viewer's day, for the status words. */
  today: string;
}) {
  const q = useClearance(id);
  return (
    <section
      aria-label="Clearance letter"
      className="card-v3 flex min-w-0 flex-col gap-5 px-5 py-5"
    >
      {q.data ? (
        <Letter c={q.data} today={today} />
      ) : q.isError ? (
        <Banner tone="bad" title="Couldn't load the letter">
          <span className="mt-2 block">
            <Button size="sm" variant="ghost" onClick={() => void q.refetch()}>
              Try again
            </Button>
          </span>
        </Banner>
      ) : q.fetchStatus === "paused" ? (
        <p role="status" className="text-[13.5px] text-ink-2">
          You&apos;re offline. The letter will load when you reconnect.
        </p>
      ) : (
        <Skeleton className="h-72 rounded-2xl" />
      )}
    </section>
  );
}

function Letter({ c, today }: { c: Clearance; today: string }) {
  const offlineId = useId();
  const checklistId = useId();
  const historyId = useId();
  const net = useNeedsConnection(offlineId);
  const [viewing, setViewing] = useState(false);
  const uploaded = instantDay(c.uploaded_at);
  const verified = c.verified_at ? instantDay(c.verified_at) : "";

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-[22px] font-black leading-tight [overflow-wrap:anywhere]">
          {c.hospital.name}
        </h2>
        <StatusWords
          {...statusText(c, today)}
          className="text-[14px] font-semibold"
        />
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <Fact term="Signed by">{c.signed_by}</Fact>
        <Fact term="Job title">{c.signer_title}</Fact>
        <Fact term="Letter date">{safeDay(c.letter_date)}</Fact>
        <Fact term="End date">{safeDay(c.end_date)}</Fact>
        <Fact term="Uploaded by">
          {uploaded
            ? `${c.uploaded_by.name} · ${uploaded}`
            : c.uploaded_by.name}
        </Fact>
        {c.verified_by && (
          <Fact term="Verified by">
            {verified
              ? `${c.verified_by.name} · ${verified}`
              : c.verified_by.name}
          </Fact>
        )}
        {c.rejection && (
          <Fact term="Reason for rejecting">
            {[label(REJECT_LABEL, c.rejection.reason), c.rejection.note]
              .filter(Boolean)
              .join(": ") || "Rejected"}
          </Fact>
        )}
        {c.refused_reason && (
          <Fact term="Why the file wasn't accepted">
            {label(REFUSED_TEXT, c.refused_reason) ?? "—"}
          </Fact>
        )}
      </dl>

      <People title="People covered" names={c.covered.map((p) => p.name)} />
      {c.covered_platform.length > 0 && (
        <People
          title="Measured Health staff"
          names={c.covered_platform.map((p) => p.name)}
        />
      )}

      <section aria-labelledby={historyId}>
        <h3 id={historyId} className="mb-2 text-[13px] font-semibold">
          History
        </h3>
        <ul
          aria-label="History"
          className="flex flex-col gap-1.5 text-[13px] text-ink-2"
        >
          {oldestFirst(c.history).map((e, i) => (
            <li key={`${e.at}-${i}`} className="[overflow-wrap:anywhere]">
              {historyLine(e)}
              {e.note && (
                <span className="block text-[12.5px] text-ink-3">{e.note}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {c.pages > 0 && (
        <div>
          <Button
            variant="soft"
            {...net.props}
            onClick={() => setViewing(true)}
          >
            <Eye aria-hidden className="size-4" />
            View letter
          </Button>
          <OfflineNote id={offlineId} />
        </div>
      )}

      <section aria-labelledby={checklistId}>
        <h3 id={checklistId} className="mb-2 text-[13px] font-semibold">
          What to check
        </h3>
        <ol
          aria-label="What to check"
          className="flex list-decimal flex-col gap-1 pl-5 text-[13.5px]"
        >
          {CHECKLIST.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <VerifyActions key={c.id} letter={c} today={today} />

      {viewing && (
        <LetterViewer
          title={`Clearance letter · ${c.hospital.name}`}
          pages={c.pages}
          loadPage={(n) => getPlatformClient().getClearancePage(c.id, n)}
          onClose={() => setViewing(false)}
        />
      )}
    </>
  );
}
