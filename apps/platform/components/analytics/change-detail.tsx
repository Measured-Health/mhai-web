"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useId, type Ref } from "react";
import type { HospitalSize, Period } from "@/lib/api/analytics-contract";
import { changeLine, type RankedChange } from "@/lib/analytics/changes";
import { countText, valueText } from "@/lib/analytics/measures";
import {
  NOT_ENOUGH_TO_COMPARE,
  type AnalyticsState,
} from "@/lib/analytics/read";
import { useChangeSeries } from "@/lib/queries/analytics";
import { useHospital } from "@/lib/queries/hospitals";
import { Button } from "@mhai/ui/button";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { ComparePanel } from "./compare-chart";
import { ContactAdmins, openHospitalClass } from "./contact-admins";
import { FollowUp } from "./follow-up";

/** "214 staff · 1,180 questions this period" (hidden: "Fewer than 5 questions"). */
export const sizeLine = (s: HospitalSize) =>
  `${countText(s.staff)} staff · ${valueText(s.questions, "count")} questions this period`;

/**
 * The selected change: its words, the chart against the other hospitals,
 * the hospital's size, who to contact, the follow-up and the way to the
 * hospital's page. On phones it shows alone, with Back.
 */
export function ChangeDetail({
  change: c,
  period,
  hospitals,
  canAct,
  onBack,
  headingRef,
}: {
  change: RankedChange;
  period: Period;
  hospitals: AnalyticsState["hospitals"];
  canAct: boolean;
  onBack?(): void;
  /** Focus lands here when the detail opens on a phone. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const titleId = useId();
  const line = changeLine(c);
  const series = useChangeSeries(c.id, period);
  const h = c.hospital;
  const size =
    h && hospitals.status === "ok"
      ? hospitals.rows.find((r) => r.hospital.id === h.id)?.size
      : undefined;
  const sizeText = !h
    ? null
    : size
      ? sizeLine(size)
      : hospitals.status === "failed"
        ? "Couldn't load the hospital's size."
        : null;

  return (
    <section
      aria-labelledby={titleId}
      className="card-v3 flex flex-col gap-4 px-[22px] py-5"
    >
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 self-start"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back
        </Button>
      )}
      <div>
        <p className="text-[12.5px] text-ink-3">Selected change</p>
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className="text-[15px] font-semibold focus:outline-none"
        >
          <span aria-hidden className="mr-1.5">
            {line.sign}
          </span>
          {line.words}
        </h2>
        {!c.comparable && (
          <p className="mt-1 text-[13px] text-ink-2">{NOT_ENOUGH_TO_COMPARE}</p>
        )}
      </div>

      {series.data ? (
        <ComparePanel hospital={h} series={series.data} size={sizeText} />
      ) : (
        <>
          {series.isError ? (
            <CouldntLoad
              what="the chart"
              onRetry={() => void series.refetch()}
            />
          ) : (
            <Loading label="Loading the chart" />
          )}
          {/* The size shows whatever happens to the chart. */}
          {sizeText && <p className="text-[13px] text-ink-2">{sizeText}</p>}
        </>
      )}

      {h && <Contact hospitalId={h.id} />}

      <FollowUp key={c.id} change={c} canAct={canAct} />

      {h && (
        <Link href={`/hospitals/${h.id}`} className={openHospitalClass}>
          Open hospital
        </Link>
      )}
    </section>
  );
}

function Contact({ hospitalId }: { hospitalId: string }) {
  const q = useHospital(hospitalId);
  if (q.isError && !q.data)
    return (
      <CouldntLoad
        what="the hospital admins"
        onRetry={() => void q.refetch()}
      />
    );
  if (!q.data) return <Loading label="Loading the hospital admins" />;
  // The detail has its own Open hospital link below: just the one.
  return <ContactAdmins hospital={q.data} showLink={false} />;
}
