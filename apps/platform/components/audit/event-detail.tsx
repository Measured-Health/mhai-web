"use client";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { AuditDetail, NamedAccessFilters } from "@/lib/api/audit-contract";
import { formatWhen } from "@/lib/activity-labels";
import { LETTER_STATUS_WORDS, REASON_WORDS, kindOf } from "@/lib/audit/kinds";
import {
  eventLine,
  hospitalWords,
  outcomeWords,
  utc,
  whoLine,
} from "@/lib/audit/words";
import { dateLabel } from "@/lib/format";
import { useAuditEvent, useReportUndisplayable } from "@/lib/queries/audit";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { SidePanel } from "@mhai/ui/side-panel";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { CopyButton } from "./copy-button";
import { undisplayableLine } from "./events-list";
import { PatientIds } from "./patient-ids";

/** The entries whose detail may list patient ids on request. */
function hasPatients(e: AuditDetail): e is AuditDetail & {
  patients: { count: number };
} {
  if (e.patients === null) return false;
  return (
    e.kind === "drilldown_deidentified" ||
    e.kind === "drilldown_named" ||
    (e.kind === "audit_searched" && e.facts.searched_kind === "pseudonym")
  );
}

/**
 * The target, from fields: a name only where the kind allows one, and never
 * a patient's pseudonym (those are behind Show patient ids).
 */
function targetLine(e: AuditDetail): string | null {
  const t = e.target;
  if (!t) return null;
  if (t.kind === "patient") return "Patients (ids shown on request)";
  const kind = kindOf(e.kind);
  const name = kind?.named && "name" in t && t.name ? t.name : null;
  return name ? `${name} · ${t.id}` : t.id;
}

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="border-t border-line py-3 first:border-t-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[.08em] text-ink-3">
        {term}
      </dt>
      <dd className="mt-1 text-[13.5px] [overflow-wrap:anywhere]">
        {children}
      </dd>
    </div>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <span className="font-mono text-[12.5px]">{children}</span>
);

function Link({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <span>{label}</span>
      <Mono>{value}</Mono>
      <CopyButton value={value} label={label.toLowerCase()} />
    </div>
  );
}

function Letter({
  e,
  onOpenNamed,
}: {
  e: AuditDetail & { letter: NonNullable<AuditDetail["letter"]> };
  onOpenNamed?: (f: NamedAccessFilters) => void;
}) {
  const l = e.letter;
  return (
    <Field term="Clearance letter">
      <p>
        <Mono>{l.id}</Mono> · {LETTER_STATUS_WORDS[l.status]}
      </p>
      <p>
        Valid {dateLabel(l.valid_from)} to {dateLabel(l.valid_to)}
      </p>
      {l.verified_by && <p>Verified by {l.verified_by.name}</p>}
      {onOpenNamed && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1"
          onClick={() =>
            onOpenNamed({
              ...(e.hospital ? { hospital: e.hospital.id } : {}),
              clearance: l.id,
            })
          }
        >
          Open in Named access
        </Button>
      )}
    </Field>
  );
}

/** The fields of one entry that read. */
function Fields({
  e,
  onOpenNamed,
}: {
  e: AuditDetail;
  onOpenNamed?: (f: NamedAccessFilters) => void;
}) {
  const kind = kindOf(e.kind);
  const consult = e.type === "consultation";
  const target = consult ? null : targetLine(e);
  const where = [e.ip, e.device].filter(Boolean).join(" · ");
  const reason =
    e.reason &&
    e.outcome === "succeeded" &&
    Object.hasOwn(REASON_WORDS, e.reason)
      ? REASON_WORDS[e.reason]
      : null;
  const links: [string, string][] = [
    ["Clearance id", e.refs.clearance_id],
    ["Export id", e.refs.export_id],
    ["Request id", e.refs.request_id],
  ].filter((l): l is [string, string] => l[1] !== null);

  return (
    <>
      {e.after_break && (
        <div
          role="note"
          className="mb-3 flex items-center gap-2 rounded-xl bg-warn-wash px-4 py-3 text-[13.5px] font-semibold text-warn-deep"
        >
          <TriangleAlert aria-hidden className="size-4 shrink-0" />
          <span>After an integrity failure</span>
        </div>
      )}
      <dl>
        <Field term="When">
          <time dateTime={e.at}>{formatWhen(e.at)}</time>
          <br />
          <span className="text-ink-2">{utc(e.at)}</span>
        </Field>
        <Field term="Who">{whoLine(e.actor)}</Field>
        <Field term="Hospital">{hospitalWords(e.hospital)}</Field>
        <Field term="Action">{eventLine(e)}</Field>
        {consult && (
          <>
            {e.facts.specialty && (
              <Field term="Specialty">
                {e.facts.specialty.charAt(0).toUpperCase() +
                  e.facts.specialty.slice(1).replace(/_/g, " ")}
              </Field>
            )}
            {e.facts.confidence && (
              <Field term="Confidence">
                {e.facts.confidence.charAt(0).toUpperCase() +
                  e.facts.confidence.slice(1)}
              </Field>
            )}
          </>
        )}
        {target && <Field term="Target">{target}</Field>}
        <Field term="Outcome">{outcomeWords(e.outcome, e.reason)}</Field>
        <Field term="From where">{where || "Not recorded"}</Field>
        <Field term="Flags">
          {e.flag === "security"
            ? "Security"
            : e.flag === "policy"
              ? "Policy"
              : "None"}
        </Field>
        {!consult && reason && <Field term="Reason">{reason}</Field>}
        {!consult && kind?.note && e.note && (
          <Field term="Note">{e.note}</Field>
        )}
        {links.length > 0 && (
          <Field term="Links">
            {links.map(([label, value]) => (
              <Link key={label} label={label} value={value} />
            ))}
          </Field>
        )}
        <Field term="Entry">
          <p>#{e.seq}</p>
          <div className="flex flex-wrap items-center gap-x-2">
            <Mono>{e.hash}</Mono>
            <CopyButton value={e.hash} label="fingerprint" />
          </div>
        </Field>
        {hasPatients(e) && (
          <Field term="Patients">
            <PatientIds id={e.id} count={e.patients.count} />
          </Field>
        )}
        {e.letter && (
          <Letter e={{ ...e, letter: e.letter }} onOpenNamed={onOpenNamed} />
        )}
      </dl>
    </>
  );
}

function Body({
  id,
  onOpenNamed,
  q,
}: {
  id: string;
  onOpenNamed?: (f: NamedAccessFilters) => void;
  q: ReturnType<typeof useAuditEvent>;
}) {
  const row = q.data;
  useReportUndisplayable(row && !row.ok ? [row] : []);
  if (q.isError)
    return <CouldntLoad what="this entry" onRetry={() => void q.refetch()} />;
  if (!row) return <Loading label="Loading the entry" />;
  if (!row.ok)
    return (
      <p className="font-mono text-[13px] [overflow-wrap:anywhere]">
        {undisplayableLine({ ...row, id: row.id ?? id })}
      </p>
    );
  return <Fields e={row.event} onOpenNamed={onOpenNamed} />;
}

/**
 * One entry in full. From `md` it is a side panel; below it, a full page
 * with Back (the list owner returns focus to the row). Fields are built
 * from the entry's structure, never from server text; an entry that can't
 * be read shows only its id and position.
 */
export function EventDetail({
  id,
  onClose,
  onOpenNamed,
}: {
  id: string;
  onClose(): void;
  onOpenNamed?: (f: NamedAccessFilters) => void;
}) {
  const desktop = useIsDesktop();
  const q = useAuditEvent(id);
  const seq = q.data?.ok ? q.data.event.seq : (q.data?.seq ?? null);
  const title = seq === null ? "Entry" : `Entry #${seq}`;
  const body = <Body id={id} q={q} onOpenNamed={onOpenNamed} />;

  if (desktop)
    return (
      <SidePanel open onClose={onClose} title={title}>
        {body}
      </SidePanel>
    );
  return (
    <section aria-label={title} className="card-v3 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft aria-hidden className="size-4" />
          Back
        </Button>
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      {body}
    </section>
  );
}
