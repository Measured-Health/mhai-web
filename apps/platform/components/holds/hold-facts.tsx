"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalHold } from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";
import { holdReasonLabel } from "@/lib/holds/labels";
import { scopeLabel, statusLine } from "@/lib/holds/rules";
import { Section } from "../hospitals/section";
import { HoldStatus } from "./hold-status";

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{term}</dt>
      <dd className="[overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

/**
 * Everything about a hold, the note included: auditors see it all. `action`
 * is Edit, for platform admins on a hold that isn't lifted.
 */
export function HoldFacts({
  hold: h,
  now,
  action,
}: {
  hold: LegalHold;
  now: number;
  action?: ReactNode;
}) {
  return (
    <Section title="Details" action={action}>
      <dl className="grid gap-x-6 gap-y-3 text-[13.5px] sm:grid-cols-[160px_1fr]">
        <Row term="Hospital">
          <Link
            href={`/hospitals/${encodeURIComponent(h.hospital.id)}`}
            className="inline-flex min-h-11 items-center font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep sm:min-h-0"
          >
            {h.hospital.name}
          </Link>
        </Row>
        <Row term="What it covers">{scopeLabel(h.scope)}</Row>
        <Row term="Reason">{holdReasonLabel(h.reason)}</Row>
        <Row term="Reference">
          <span className="font-mono">{h.reference}</span>
        </Row>
        <Row term="Asked for by">{h.asked_by}</Row>
        <Row term="Note">
          {h.note ?? <span className="text-ink-3">None</span>}
        </Row>
        <Row term="Placed by">
          {h.placed_by.name} · {dateLabel(h.placed_at)}
        </Row>
        <Row term="Review date">{dateLabel(h.review_on)}</Row>
        <Row term="Status">
          <HoldStatus hold={h} text={statusLine(h, now)} />
        </Row>
      </dl>
    </Section>
  );
}
