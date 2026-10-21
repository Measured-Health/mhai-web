"use client";
import Link from "next/link";
import { useId, useState, type ReactNode } from "react";
import type { OversightItemOut } from "@/lib/api/admin-contract";
import { useOversight, useRemindReviewers } from "@/lib/admin-queries";
import { adminError } from "@/lib/admin/errors";
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
import { useNetwork } from "@mhai/api-client/network";
import { ageLabel } from "@/lib/time";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { useToast } from "@mhai/ui/toast";
import { ActivityTabs } from "./activity-tabs";
import { AdminFrame } from "./admin-frame";
import { AssignDialog } from "./assign-dialog";
import { OverdueChip, ShortChip } from "./chips";

const time = (iso: string | null) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/** "just now", "12 min ago", "2 h ago". */
function agoText(t: number, now: number): string {
  const a = ageLabel(t, now);
  return a === "0 min" ? "just now" : `${a} ago`;
}

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
  online: boolean;
  busy: boolean;
  offlineId: string;
  onRemind(i: OversightItemOut): void;
  onAssign(i: OversightItemOut): void;
};

/** "#C-118 · suggested by Dr. Reyes", plus who it is assigned to and any reminder. */
function Who({ item, now }: { item: OversightItemOut; now: number }) {
  const reminded = time(item.reminded_at);
  return (
    <span className="[overflow-wrap:anywhere]">
      <b className="font-mono">#{item.ref}</b>{" "}
      <span className="text-ink-3">
        · suggested by {item.suggested_by.display_name}
      </span>
      {item.assigned_to && (
        <span className="mt-1 block text-[12px] text-ink-2">
          Assigned to {item.assigned_to.display_name}
        </span>
      )}
      {reminded !== null && (
        <span className="mt-1 block text-[12px] text-ink-3">
          Reminded {agoText(reminded, now)}
        </span>
      )}
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
      <table className="w-full min-w-[680px] text-left text-[13px]">
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
            <th scope="col" className="px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((i) => (
            <tr key={i.id} className="border-t border-line align-top">
              <td className="px-4 py-3">
                <Who item={i} now={p.now} />
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
              <td className="px-4 py-3">
                <span className="flex flex-wrap justify-end gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remind reviewers about ${i.ref}`}
                    aria-describedby={p.online ? undefined : p.offlineId}
                    disabled={!p.online || p.busy}
                    onClick={() => p.onRemind(i)}
                  >
                    Remind
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    aria-label={`Assign a reviewer to ${i.ref}`}
                    aria-describedby={p.online ? undefined : p.offlineId}
                    disabled={!p.online}
                    onClick={() => p.onAssign(i)}
                  >
                    Assign reviewer
                  </Button>
                </span>
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
        const since = time(i.submitted_at);
        const detail = `${i.ref}, ${i.specialty ?? "no specialty"}, waiting ${
          since === null ? "an unknown time" : ageLabel(since, p.now)
        }`;
        return (
          <li
            key={i.id}
            className="card-v3 flex flex-col gap-2 p-3.5 text-[13px]"
          >
            <Who item={i} now={p.now} />
            <span className="text-ink-2 [overflow-wrap:anywhere]">
              {i.specialty ?? "No specialty"}
            </span>
            <Waited item={i} overdueHours={p.overdueHours} now={p.now} />
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-ink-3">Eligible reviewers</span>
              <Eligible n={i.eligible_reviewers} />
            </span>
            <span className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remind reviewers about ${detail}`}
                aria-describedby={p.online ? undefined : p.offlineId}
                disabled={!p.online || p.busy}
                onClick={() => p.onRemind(i)}
              >
                Remind
              </Button>
              <Button
                size="sm"
                variant="soft"
                aria-label={`Assign a reviewer to ${detail}`}
                aria-describedby={p.online ? undefined : p.offlineId}
                disabled={!p.online}
                onClick={() => p.onAssign(i)}
              >
                Assign reviewer
              </Button>
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
  const remind = useRemindReviewers();
  const toast = useToast();
  const now = useNow(60_000);
  const desktop = useIsDesktop();
  const { online } = useNetwork();
  const { user } = useAuth();
  const offlineId = useId();
  const [assigning, setAssigning] = useState<OversightItemOut | null>(null);
  // Corrections found already decided: gone from the list even before a refresh.
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const o = q.data;
  const failed = q.isError ? adminError(q.error) : null;
  const waitingOffline =
    q.isPending && !q.isError && q.fetchStatus === "paused";
  const items = o ? o.items.filter((i) => !decided.has(i.id)) : [];
  const gone = (id: string) => setDecided((s) => new Set(s).add(id));

  function sendReminder(item: OversightItemOut) {
    remind.mutate(
      { id: item.id },
      {
        onSuccess: () =>
          toast.show({
            title: "Reviewers reminded",
            body: `${item.specialty ?? "Eligible"} reviewers got a reminder about ${item.ref}.`,
            tone: "ok",
          }),
        onError: (e) => {
          const err = adminError(e);
          if (err.gone) gone(item.id);
          toast.show({ title: err.title, body: err.body, ms: 8000 });
        },
      },
    );
  }

  const rowProps = {
    overdueHours: o?.overdue_after_hours ?? 0,
    now,
    online,
    busy: remind.isPending,
    offlineId,
    onRemind: sendReminder,
    onAssign: setAssigning,
  };

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
            <Tile
              label="Waiting"
              value={String(
                Math.max(
                  0,
                  o.waiting - o.items.filter((i) => decided.has(i.id)).length,
                ),
              )}
            />
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

          {!online && (
            <p id={offlineId} className="text-[13px] text-ink-3">
              You&apos;re offline. Reminders and assignments need a connection.
            </p>
          )}

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
      {assigning && (
        <AssignDialog
          item={assigning}
          onClose={() => setAssigning(null)}
          onGone={gone}
        />
      )}
    </AdminFrame>
  );
}
