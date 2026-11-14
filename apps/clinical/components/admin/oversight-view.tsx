"use client";
import Link from "next/link";
import { useId, type ReactNode } from "react";
import type { OversightItemOut } from "@/lib/api/admin-contract";
import { useOversight } from "@/lib/admin-queries";
import { NOT_AVAILABLE, adminError } from "@/lib/admin/errors";
import {
  hoursLabel,
  isOverdueItem,
  isShort,
  oversightOrder,
} from "@/lib/admin/report";
import { useAuth } from "@/lib/auth/auth-context";
import { isClinical } from "@/lib/auth/types";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useNow } from "@mhai/ui/hooks/use-now";
import { ageLabel } from "@/lib/time";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { ActivityTabs } from "./activity-tabs";
import { AdminFrame } from "./admin-frame";
import { OverdueChip, ShortChip } from "./chips";

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-v3 px-5 py-4">
      <b className="block font-display text-[34px] font-black leading-none">
        {value}
      </b>
      <span className="mt-1 block text-[12.5px] text-ink-3">{label}</span>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card-v3 px-[22px] py-4">
      <h3 id={id} className="mb-3 text-[14px] font-semibold">
        {title}
      </h3>
      {children}
    </section>
  );
}

type RowProps = {
  item: OversightItemOut;
  overdueHours: number;
  now: number;
};

/** "#C-118 · suggested by Dr. Reyes". Core has no assignment or reminders. */
function Who({ item }: { item: OversightItemOut }) {
  return (
    <span className="[overflow-wrap:anywhere]">
      <b className="font-mono">#{item.ref}</b>{" "}
      <span className="text-ink-3">
        · suggested by {item.suggested_by.display_name}
      </span>
    </span>
  );
}

function Waited({
  item,
  overdueHours,
  now,
}: Pick<RowProps, "item" | "overdueHours" | "now">) {
  const since = time(item.submitted_at);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono">
        {since === null ? "—" : ageLabel(since, now)}
      </span>
      {isOverdueItem(item, overdueHours, now) && (
        <OverdueChip hours={overdueHours} />
      )}
    </span>
  );
}

function Eligible({ n }: { n: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="font-mono">{n}</span>
      {isShort(n) && <ShortChip />}
    </span>
  );
}

function OversightTable(
  p: Omit<RowProps, "item"> & { items: OversightItemOut[] },
) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <caption className="sr-only">Corrections waiting for review</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {["Correction", "Specialty", "Waiting", "Eligible reviewers"].map(
              (h) => (
                <th key={h} scope="col" className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {p.items.map((i) => (
            <tr key={i.id} className="border-t border-line align-top">
              <td className="px-4 py-3">
                <Who item={i} />
              </td>
              <td className="px-4 py-3 [overflow-wrap:anywhere]">
                {i.specialty ?? "—"}
              </td>
              <td className="px-4 py-3">
                <Waited item={i} overdueHours={p.overdueHours} now={p.now} />
              </td>
              <td className="px-4 py-3">
                <Eligible n={i.eligible_reviewers} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The same corrections as cards on phones: every field, 44 px buttons. */
function OversightCards(
  p: Omit<RowProps, "item"> & { items: OversightItemOut[] },
) {
  return (
    <ul
      aria-label="Corrections waiting for review"
      className="flex flex-col gap-2"
    >
      {p.items.map((i) => {
        return (
          <li
            key={i.id}
            className="card-v3 flex flex-col gap-2 p-3.5 text-[13px]"
          >
            <Who item={i} />
            <span className="text-ink-2 [overflow-wrap:anywhere]">
              {i.specialty ?? "No specialty"}
            </span>
            <Waited item={i} overdueHours={p.overdueHours} now={p.now} />
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-3">Eligible reviewers</span>
              <Eligible n={i.eligible_reviewers} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Keep corrections moving, without clinical content (hospital-admin.html tab 7). */
export function OversightView() {
  const q = useOversight();
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { user } = useAuth();
  const o = q.data;
  const failed = q.isError ? adminError(q.error) : null;
  const waitingOffline =
    q.isPending && !q.isError && q.fetchStatus === "paused";
  const items = o?.items ?? [];
  const rowProps = { overdueHours: o?.overdue_after_hours ?? 0, now };

  return (
    <AdminFrame title="Activity">
      <ActivityTabs current="oversight" />
      {failed && (
        <div className="mb-4">
          <Banner tone="bad" title={failed.title}>
            {failed.body}
            <span className="mt-2 block">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void q.refetch()}
              >
                Try again
              </Button>
            </span>
          </Banner>
        </div>
      )}
      {waitingOffline ? (
        <div
          role="status"
          className="card-v3 p-6 text-center text-[14px] text-ink-2"
        >
          You&apos;re offline. Review oversight will load when you reconnect.
        </div>
      ) : !o ? (
        q.isError ? null : (
          <Skeleton className="h-80 rounded-2xl" />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Waiting" value={String(o.waiting)} />
            <Tile
              label={`Overdue (over ${o.overdue_after_hours} h)`}
              value={String(
                items.filter((i) =>
                  isOverdueItem(i, o.overdue_after_hours, now),
                ).length,
              )}
            />
            {o.median_decision_hours !== null && (
              <Tile
                label="Median time to decision"
                value={hoursLabel(o.median_decision_hours)}
              />
            )}
            <Tile
              label="Decided this week"
              value={String(o.decided_this_week)}
            />
          </div>

          <p className="text-[13px] text-ink-2">
            Every active clinician can review a correction, except the person
            who suggested it. Reminding or assigning reviewers:{" "}
            {NOT_AVAILABLE.toLowerCase()}.
          </p>

          {items.length === 0 ? (
            <p className="card-v3 p-6 text-center text-[14px] text-ink-2">
              Nothing is waiting for review.
            </p>
          ) : desktop ? (
            <OversightTable items={oversightOrder(items)} {...rowProps} />
          ) : (
            <OversightCards items={oversightOrder(items)} {...rowProps} />
          )}

          <Card title="Reviewers by specialty">
            <ul className="flex flex-col gap-2 text-[13px]">
              {o.reviewers_by_specialty.map((r) => (
                <li
                  key={r.specialty}
                  className="flex flex-wrap items-center gap-2 [overflow-wrap:anywhere]"
                >
                  <span className="flex-1">{r.specialty}</span>
                  <b className="font-mono">{r.reviewers}</b>
                  {isShort(r.reviewers) && (
                    <>
                      <ShortChip />
                      <Link
                        href="/admin/staff"
                        className="inline-flex min-h-11 items-center text-[12.5px] font-semibold text-mint-deep underline sm:min-h-0"
                      >
                        Consider adding a reviewer in Staff
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <p className="text-[12.5px] text-ink-3">
            You see the specialty and how long it&apos;s waited, never the
            clinical content.{" "}
            {isClinical(user) ? (
              <>
                To approve or reject, use{" "}
                <Link
                  href="/review"
                  className="font-semibold text-mint-deep underline"
                >
                  Review corrections
                </Link>
                .
              </>
            ) : (
              "Only clinicians can approve or reject corrections."
            )}
          </p>
        </div>
      )}
    </AdminFrame>
  );
}
