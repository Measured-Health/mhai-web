"use client";
import { Eye, RefreshCw, UserMinus, Ban } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import {
  REFUSED_TEXT,
  REJECT_LABEL,
  REVOKE_LABEL,
  NARROW_LABEL,
} from "@mhai/ui/clearances";
import { useNetwork } from "@mhai/api-client/network";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { LetterViewer } from "@mhai/ui/letter-viewer";
import { SidePanel } from "@mhai/ui/side-panel";
import { Skeleton } from "@mhai/ui/skeleton";
import { getClearanceClient } from "@/lib/api/clearances";
import type {
  ClearanceEventOut,
  ClearanceOut,
} from "@/lib/api/clearances-contract";
import { useClearance, useClearances } from "@/lib/clearance-queries";
import {
  instantLabel,
  safeDayLabel,
  statusLine,
} from "@/lib/clearances/status";
import { listNames } from "@/lib/clearances/summary";
import { LetterStatus } from "./letter-list";
import { NarrowDialog } from "./narrow-dialog";
import { RevokeDialog } from "./revoke-dialog";
import { UploadDialog, type UploadPrefill } from "./upload-dialog";

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
function what(e: ClearanceEventOut): string {
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
      return withReason(
        e.removed?.length
          ? `Removed ${listNames(e.removed.map((p) => p.display_name))}`
          : "Removed people",
        label(NARROW_LABEL, e.reason),
      );
    case "revoked":
      return withReason("Revoked", label(REVOKE_LABEL, e.reason));
    case "ended":
      return "Ended";
    case "reminded":
      return "Reminder sent";
  }
}

/** Oldest first, whatever order they came in; an unreadable time goes last. */
const oldestFirst = (list: ClearanceEventOut[]) => {
  const ms = (e: ClearanceEventOut) => {
    const t = Date.parse(e.at);
    return Number.isNaN(t) ? Infinity : t;
  };
  return [...list].sort((a, b) => {
    const x = ms(a);
    const y = ms(b);
    return x === y ? 0 : x < y ? -1 : 1;
  });
};

/** "{date} · {what} · {who}"; no who for what happened by itself. */
const historyLine = (e: ClearanceEventOut) =>
  [instantLabel(e.at) ?? "—", what(e), e.by?.display_name]
    .filter(Boolean)
    .join(" · ");

/** What a renewal starts from: the same people and signer. */
const prefillFrom = (c: ClearanceOut): UploadPrefill => ({
  covered: c.covered.map((p) => p.id),
  signed_by: c.signed_by,
  signer_title: c.signer_title,
  renews: c.id,
  names: Object.fromEntries(c.covered.map((p) => [p.id, p.display_name])),
  platform: c.covered_platform.map((p) => p.display_name),
});

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[12px] font-semibold text-ink-3">{term}</dt>
      <dd className="text-[14px] [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function People({ label: name, names }: { label: string; names: string[] }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-1 text-[13px] font-semibold">
        {name}
      </h3>
      <ul aria-label={name} className="flex flex-col gap-1 text-[14px]">
        {names.map((n, i) => (
          <li key={`${n}-${i}`} className="[overflow-wrap:anywhere]">
            {n}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Open = "view" | "revoke" | "narrow" | "renew" | null;

/**
 * A letter's details: everything entered, its status and history, and what
 * can be done with it (view, revoke, remove a person, renew). A side panel
 * from `md`, a sheet below. Which letter is open lives in the page's state
 * only, never the URL. Everything opened from here is a modal dialog, never
 * a sheet on this sheet (ruling 13).
 */
export function LetterDetail({
  id,
  onClose,
}: {
  id: string | null;
  onClose(): void;
}) {
  return (
    <SidePanel open={id !== null} onClose={onClose} title="Clearance letter">
      {id !== null && <Detail key={id} id={id} />}
    </SidePanel>
  );
}

function Detail({ id }: { id: string }) {
  const q = useClearance(id);
  const list = useClearances();
  const { online } = useNetwork();
  const offlineId = useId();
  const historyId = useId();
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);

  if (q.isError || list.isError)
    return (
      <Banner tone="bad" title="Couldn't load the letter">
        <span className="mt-2 block">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (q.isError) void q.refetch();
              if (list.isError) void list.refetch();
            }}
          >
            Try again
          </Button>
        </span>
      </Banner>
    );
  if (!q.data || !list.data)
    return q.fetchStatus === "paused" || list.fetchStatus === "paused" ? (
      <p role="status" className="text-[13.5px] text-ink-2">
        You&apos;re offline. The letter will load when you reconnect.
      </p>
    ) : (
      <Skeleton className="h-72 rounded-2xl" />
    );

  const c = q.data;
  const live = c.status === "waiting" || c.status === "active";
  const people = c.covered.length + c.covered_platform.length;
  const can = {
    view: c.pages > 0,
    revoke: live,
    narrow: live && people >= 2,
    renew:
      c.status === "active" || c.status === "ended" || c.status === "revoked",
  };
  const any = can.view || can.revoke || can.narrow || can.renew;
  const off = {
    disabled: !online,
    "aria-describedby": online ? undefined : offlineId,
  };
  const uploaded = instantLabel(c.uploaded_at);
  const verified = c.verified_at ? instantLabel(c.verified_at) : null;

  return (
    <div className="flex flex-col gap-5">
      <LetterStatus line={statusLine(c, list.data.today)} />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact term="Signed by">{c.signed_by}</Fact>
        <Fact term="Job title">{c.signer_title}</Fact>
        <Fact term="Letter date">{safeDayLabel(c.letter_date) ?? "—"}</Fact>
        <Fact term="End date">{safeDayLabel(c.end_date) ?? "—"}</Fact>
        <Fact term="Uploaded by">
          {uploaded
            ? `${c.uploaded_by.display_name} · ${uploaded}`
            : c.uploaded_by.display_name}
        </Fact>
        {c.verified_by && (
          <Fact term="Verified by">
            {verified
              ? `${c.verified_by.display_name} · ${verified}`
              : c.verified_by.display_name}
          </Fact>
        )}
      </dl>

      <People
        label="People covered"
        names={c.covered.map((p) => p.display_name)}
      />
      {c.covered_platform.length > 0 && (
        <People
          label="Measured Health staff"
          names={c.covered_platform.map((p) => p.display_name)}
        />
      )}

      {any && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {can.view && (
              <Button variant="soft" {...off} onClick={() => setOpen("view")}>
                <Eye aria-hidden className="size-4" />
                View letter
              </Button>
            )}
            {can.renew && (
              <Button variant="ghost" {...off} onClick={() => setOpen("renew")}>
                <RefreshCw aria-hidden className="size-4" />
                Renew
              </Button>
            )}
            {can.narrow && (
              <Button
                variant="ghost"
                {...off}
                onClick={() => setOpen("narrow")}
              >
                <UserMinus aria-hidden className="size-4" />
                Remove a person
              </Button>
            )}
            {can.revoke && (
              <Button
                variant="danger"
                {...off}
                onClick={() => setOpen("revoke")}
              >
                <Ban aria-hidden className="size-4" />
                Revoke
              </Button>
            )}
          </div>
          {!online && (
            <p id={offlineId} className="text-[12.5px] text-ink-3">
              You&apos;re offline. Viewing and changing a letter need a
              connection.
            </p>
          )}
        </div>
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

      {open === "view" && (
        <LetterViewer
          title="The letter"
          pages={c.pages}
          loadPage={(n) => getClearanceClient().getClearancePage(id, n)}
          onClose={close}
        />
      )}
      {open === "revoke" && <RevokeDialog letter={c} onClose={close} />}
      {open === "narrow" && (
        <NarrowDialog
          letter={c}
          onClose={close}
          onRevokeInstead={() => setOpen("revoke")}
        />
      )}
      <UploadDialog
        open={open === "renew"}
        onClose={close}
        prefill={prefillFrom(c)}
        overPanel
      />
    </div>
  );
}
