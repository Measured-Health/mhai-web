"use client";
import {
  Download,
  OctagonAlert,
  ShieldCheck,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { ConfidenceLevel, UsagePeriod } from "@/lib/api/admin-contract";
import { useUsage } from "@/lib/admin-queries";
import { csvName, downloadCsv, usageCsv } from "@/lib/admin/csv";
import {
  CONFIDENCE_ORDER,
  PERIODS,
  countLabel,
  hoursLabel,
  percentLabel,
  shares,
} from "@/lib/admin/report";
import { adminError } from "@/lib/admin/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { RESULT_LABEL } from "@/lib/labels";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { BarList } from "../ui/charts/bar-list";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AdminFrame } from "./admin-frame";

const LEVEL: Record<
  ConfidenceLevel,
  { Icon: typeof ShieldCheck; bar: string; text: string }
> = {
  high: { Icon: ShieldCheck, bar: "bg-ok", text: "text-ok-deep" },
  caution: { Icon: TriangleAlert, bar: "bg-warn", text: "text-warn-deep" },
  review: { Icon: OctagonAlert, bar: "bg-bad", text: "text-bad-deep" },
  failed: { Icon: XCircle, bar: "bg-ink-3", text: "text-ink-2" },
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

/** Usage in counts only (hospital-admin.html tab 5). */
export function UsageView() {
  const [period, setPeriod] = useState<UsagePeriod>("this_month");
  const q = useUsage(period);
  const { user } = useAuth();
  const toast = useToast();
  const periodId = useId();
  const loadingId = useId();
  const hospital = user?.hospital ?? "Hospital";
  const u = q.data;
  const failed = q.isError ? adminError(q.error) : null;
  // Export waits for the numbers; say so instead of a silent disabled button.
  const loading = !u && !q.isError;
  const mix = u ? shares(u.confidence) : null;

  return (
    <AdminFrame
      title="Usage"
      actions={
        <>
          <label htmlFor={periodId} className="sr-only">
            Period
          </label>
          <select
            id={periodId}
            value={period}
            onChange={(e) => setPeriod(e.target.value as UsagePeriod)}
            className="min-h-11 rounded-full border border-line bg-white px-4 text-[13px] focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            {PERIODS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            disabled={!u}
            aria-describedby={loading ? loadingId : undefined}
            onClick={() => {
              if (!u) return;
              downloadCsv(
                csvName("usage", hospital, Date.now()),
                usageCsv(u, hospital),
              );
              toast.show({
                title: "Usage exported",
                body: "Counts only. The file is in your downloads.",
                tone: "ok",
              });
            }}
          >
            <Download aria-hidden className="size-4" />
            Export CSV
          </Button>
          {loading && (
            <span id={loadingId} className="text-[12px] text-ink-3">
              Loading…
            </span>
          )}
        </>
      }
    >
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
      {!u ? (
        q.isPending && !q.isError && q.fetchStatus === "paused" ? (
          <div
            role="status"
            className="card-v3 p-6 text-center text-[14px] text-ink-2"
          >
            You&apos;re offline. Usage will load when you reconnect.
          </div>
        ) : q.isError ? null : (
          <Skeleton className="h-80 rounded-2xl" />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Consultations" value={countLabel(u.consultations)} />
            <Tile
              label="Active clinicians"
              value={countLabel(u.active_clinicians)}
            />
            {u.agreement_rate !== null && (
              <Tile
                label="Agreed with result"
                value={percentLabel(u.agreement_rate)}
              />
            )}
            {u.median_review_hours !== null && (
              <Tile
                label="Median review time"
                value={hoursLabel(u.median_review_hours)}
              />
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Result confidence">
              {mix ? (
                <BarList
                  animate={false}
                  max={100}
                  items={CONFIDENCE_ORDER.map((k) => {
                    const { Icon, bar, text } = LEVEL[k];
                    return {
                      key: k,
                      label: RESULT_LABEL[k],
                      value: mix[k],
                      text: `${mix[k]}%`,
                      icon: <Icon aria-hidden className={cn("size-4", text)} />,
                      barClass: bar,
                    };
                  })}
                />
              ) : (
                <p className="text-[13px] text-ink-3">
                  No consultations in this period.
                </p>
              )}
            </Card>
            <Card title="By specialty">
              <BarList
                animate={false}
                items={u.by_specialty.map((s) => ({
                  key: s.specialty,
                  label: s.specialty,
                  value: s.consultations,
                  text: countLabel(s.consultations),
                }))}
              />
            </Card>
          </div>
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-3">
        Counts only. No patient details or question text are shown here.
      </p>
    </AdminFrame>
  );
}
