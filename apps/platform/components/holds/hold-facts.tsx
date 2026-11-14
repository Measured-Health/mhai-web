"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalHold } from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";
import { holdReasonLabel } from "@/lib/holds/labels";
import { placedByLabel, scopeLabel, statusLine } from "@/lib/holds/rules";
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
 * Everything about a hold: auditors see it all. A hold keeps every record
 * and carries no note and no name of who asked (core keeps neither).
 * `action` is Change review date, for platform admins on an open hold.
 */
export function HoldFacts({
  hold: h,
  action,
}: {
  hold: LegalHold;
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
        <Row term="What it covers">{scopeLabel()}</Row>
        <Row term="Reason">{holdReasonLabel(h.reason)}</Row>
        <Row term="Reference">
          <span className="font-mono">{h.reference}</span>
        </Row>
        <Row term="Placed">
          {placedByLabel(h)} · {dateLabel(h.placed_at)}
        </Row>
        <Row term="Review date">{dateLabel(h.review_on)}</Row>
        <Row term="Status">
          <HoldStatus hold={h} text={statusLine(h)} />
        </Row>
      </dl>
    </Section>
  );
}
