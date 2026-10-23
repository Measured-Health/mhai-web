"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Plus,
  Search,
  Stethoscope,
  ChartPie,
  CircleHelp,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { canUseAnalysis, isAdminOnly, isHospitalAdmin } from "@/lib/auth/types";
import { ANALYSIS_HREF } from "@/lib/analysis-queries";
import { useReviewBadge } from "@/lib/correction-queries";
import { historyStatus, type SessionItem } from "@/lib/session-store";
import { useNow } from "@mhai/ui/hooks/use-now";
import { ago } from "@/lib/time";
import { Logo, Mark } from "@mhai/ui/brand";
import { cn } from "@mhai/ui/cn";
import { OutboxIndicator } from "../states/outbox-indicator";
import { AccountMenu } from "./account-menu";
import { AdminNav } from "./admin-nav";
import { groupHistory } from "./group-history";

const DOT = {
  high: "bg-ok",
  caution: "bg-warn",
  review: "bg-bad",
  failed: "bg-ink-3",
} as const;

/** The queue with others' waiting count (R4); hidden if you can't review (R3). */
function ReviewLink({ rail, on }: { rail: boolean; on: boolean }) {
  const { count, forbidden } = useReviewBadge();
  if (forbidden) return null;
  const name = count
    ? `Review corrections, ${count} waiting`
    : "Review corrections";
  return (
    <Link
      href="/review"
      title="Review corrections"
      aria-label={name}
      aria-current={on ? "page" : undefined}
      className={cn(
        "mt-2.5 flex min-h-11 items-center gap-2.5 rounded-xl text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
        rail ? "relative w-11 justify-center" : "px-2.5",
        on
          ? "bg-mint-wash text-mint-deep shadow-[inset_3px_0_0_var(--color-mint)]"
          : "text-ink-2 hover:bg-bg",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          on ? "bg-white" : "bg-lilac text-bloom",
        )}
      >
        <ArrowLeftRight className="size-3.5" />
      </span>
      <span className={rail ? "sr-only" : ""}>Review corrections</span>
      {count ? (
        <span
          aria-hidden
          className={cn(
            "rounded-full bg-warn-deep px-2 py-0.5 font-mono text-[11px] font-bold text-white",
            rail ? "absolute -right-1 -top-1" : "ml-auto",
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

/** Analysis for a clinician who holds the analyst role, under Review. */
function AnalysisLink({ rail, on }: { rail: boolean; on: boolean }) {
  return (
    <Link
      href={ANALYSIS_HREF}
      title="Analysis"
      aria-current={on ? "page" : undefined}
      className={cn(
        "mt-1 flex min-h-11 items-center gap-2.5 rounded-xl text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
        rail ? "w-11 justify-center" : "px-2.5",
        on
          ? "bg-mint-wash text-mint-deep shadow-[inset_3px_0_0_var(--color-mint)]"
          : "text-ink-2 hover:bg-bg",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          on ? "bg-white" : "bg-lilac text-bloom",
        )}
      >
        <ChartPie className="size-3.5" />
      </span>
      <span className={rail ? "sr-only" : ""}>Analysis</span>
    </Link>
  );
}

/** `rail` hides labels (tablet). Labels stay in the accessibility tree via sr-only. */
export function Sidebar({
  items,
  rail = false,
  onOpenSearch,
}: {
  items: SessionItem[];
  rail?: boolean;
  onOpenSearch?: () => void;
}) {
  const path = usePathname();
  const now = useNow(60_000);
  const label = rail ? "sr-only" : "";
  const { user } = useAuth();
  // A hospital admin who isn't a clinician sees no clinical parts (R3).
  const adminOnly = isAdminOnly(user);
  const admin = isHospitalAdmin(user);
  const analysis = canUseAnalysis(user);
  return (
    <nav
      aria-label={adminOnly ? "Hospital admin side" : "Consultations"}
      className={cn(
        "relative flex h-full flex-col border-r border-line bg-gradient-to-b from-white to-bg py-[18px]",
        rail ? "items-center px-3" : "px-3.5",
      )}
    >
      <div className={cn("pb-4", rail ? "" : "px-1.5")}>
        {rail ? (
          <Mark />
        ) : (
          <>
            <Logo />
            <p className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-3">
              <span className="relative size-[7px] rounded-full bg-mint after:absolute after:-inset-[3px] after:animate-[ring_calc(var(--t-story)*3.4)_ease-out_infinite] after:rounded-full after:border-[1.5px] after:border-mint" />
              {adminOnly ? "Hospital admin" : "Clinical decision support"}
            </p>
          </>
        )}
      </div>
      {!adminOnly && (
        <>
          <Link
            href="/"
            title="New consultation"
            className={cn(
              "flex min-h-11 items-center justify-center gap-2 rounded-xl bg-mint font-semibold text-white shadow-[0_10px_24px_-10px_var(--color-mint)]",
              rail ? "size-11" : "px-3",
            )}
          >
            <Plus aria-hidden className="size-5" />
            <span className={label}>New consultation</span>
          </Link>
          <OutboxIndicator rail={rail} />
          <button
            type="button"
            onClick={onOpenSearch}
            title="Search consultations (⌘K)"
            className={cn(
              "mt-2.5 flex min-h-11 items-center gap-2 rounded-[10px] border border-line bg-bg text-[13px] text-ink-3",
              rail ? "w-11 justify-center" : "px-2.5",
            )}
          >
            <Search aria-hidden className="size-4" />
            <span className={label}>Search consultations</span>
            {!rail && (
              <kbd className="ml-auto rounded border border-lilac-2 px-1.5 font-mono text-[10.5px]">
                ⌘K
              </kbd>
            )}
          </button>
          <ReviewLink rail={rail} on={path === "/review"} />
          {analysis && !admin && (
            <AnalysisLink
              rail={rail}
              on={
                path === ANALYSIS_HREF || path.startsWith(`${ANALYSIS_HREF}/`)
              }
            />
          )}
        </>
      )}
      {admin && <AdminNav rail={rail} analysis={analysis} />}
      {adminOnly ? (
        // Keeps the account menu at the bottom.
        <div className="flex-1" />
      ) : (
        <div className="mt-2 flex-1 overflow-y-auto">
          {groupHistory(items, now).map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3
                className={cn(
                  "mx-2 mb-1.5 mt-[18px] text-[10.5px] uppercase tracking-[.1em] text-ink-3",
                  rail && "sr-only",
                )}
              >
                {g.label}
              </h3>
              {g.items.map((i) => {
                const on = path === `/c/${i.id}`;
                const status = historyStatus(i);
                return (
                  <Link
                    key={i.id}
                    href={`/c/${i.id}`}
                    title={i.title}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-start gap-2.5 rounded-[10px] p-2 text-[13px] leading-tight hover:bg-bg",
                      on &&
                        "bg-mint-wash shadow-[inset_3px_0_0_var(--color-mint)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg bg-lilac text-bloom",
                        on && "bg-white text-mint-deep",
                        rail && "size-[38px]",
                      )}
                    >
                      <Stethoscope className="size-3.5" />
                    </span>
                    <span className={label}>
                      {i.title}
                      {i.flagged && (
                        <span
                          aria-label="Flagged"
                          className="ml-1.5 inline-block size-[7px] rounded-full bg-warn"
                        />
                      )}
                      <small className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-3">
                        {status.dot && (
                          <span
                            aria-hidden
                            className={cn(
                              "size-[7px] rounded-full",
                              DOT[status.dot],
                            )}
                          />
                        )}
                        {status.label} · {ago(i.createdAt, now)}
                      </small>
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
          <p
            className={cn(
              "px-2 pt-2 text-[10.5px] text-ink-3",
              rail && "sr-only",
            )}
          >
            History is kept for this session only.
          </p>
        </div>
      )}
      {!adminOnly && (
        <Link
          href="/help"
          title="Help"
          className={cn(
            "mb-1.5 flex min-h-11 items-center gap-2 rounded-[10px] text-[13px] text-ink-2 hover:bg-bg",
            rail ? "size-11 justify-center" : "px-2.5",
          )}
        >
          <CircleHelp aria-hidden className="size-4" />
          <span className={label}>Help</span>
        </Link>
      )}
      <AccountMenu rail={rail} />
    </nav>
  );
}
