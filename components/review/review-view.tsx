"use client";
import { useEffect, useRef, useState } from "react";
import type { RejectIn } from "@/lib/api/contract";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import {
  useMyCorrections,
  useMyReviews,
  usePendingCorrections,
  useRejectCorrection,
} from "@/lib/correction-queries";
import {
  buildQueue,
  correctionTitle,
  decisionError,
  pickNext,
  type DecisionError,
  type QueueItem,
} from "@/lib/corrections";
import { useNow } from "@/lib/hooks/use-now";
import { useShortcuts } from "@/lib/hooks/use-shortcuts";
import { useNetwork } from "@/lib/network";
import { useUndoableApproval } from "@/lib/review/use-undoable-approval";
import { FilterChip } from "../corrections/filter-chip";
import { useWithdrawFlow } from "../corrections/withdraw-dialog";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Skeleton } from "../ui/skeleton";
import { useToast } from "../ui/toast";
import { AllCaughtUp, RecentDecisions } from "./all-caught-up";
import { QueueList } from "./queue-list";
import { RejectDialog } from "./reject-dialog";
import { ReviewDetail } from "./review-detail";
import { UndoNotice } from "./undo-notice";

type Filter = "waiting" | "specialty" | "done";
type Ids = ReadonlySet<string>;
const add = (s: Ids, id: string): Ids => new Set(s).add(id);
const drop = (s: Ids, id: string): Ids => {
  const n = new Set(s);
  n.delete(id);
  return n;
};
const norm = (s: string | null | undefined) => s?.trim().toLowerCase() || null;

/** The corrections review queue (spec §5.4, review-queue.html). */
export function ReviewView() {
  const { user } = useAuth();
  const pending = usePendingCorrections();
  const mine = useMyCorrections();
  const reviews = useMyReviews();
  const { online } = useNetwork();
  const now = useNow(60_000);
  const toast = useToast();
  const reject = useRejectCorrection();
  const [filter, setFilter] = useState<Filter>("waiting");
  /** A snapshot: it stays on screen until you move on (Review Focus 1). */
  const [selected, setSelected] = useState<QueueItem | null>(null);
  /** Where the next one is picked from once `selected` is cleared. */
  const [resumeAt, setResumeAt] = useState(0);
  /** Decided here; hidden until the server agrees. */
  const [handled, setHandled] = useState<Ids>(() => new Set());
  /** Approved here: waiting in the undo window or being sent. */
  const [sending, setSending] = useState<Ids>(() => new Set());
  /** Decided elsewhere, as a 409 told us (W6). */
  const [goneIds, setGoneIds] = useState<Ids>(() => new Set());
  /** The API says these are your own (403, Review Focus 4). */
  const [ownIds, setOwnIds] = useState<Ids>(() => new Set());
  const [mobileDetail, setMobileDetail] = useState(false);
  const [rejectFor, setRejectFor] = useState<QueueItem | null>(null);
  const [rejectError, setRejectError] = useState<DecisionError | null>(null);
  const [refocus, setRefocus] = useState(0);
  const undoRef = useRef<HTMLButtonElement>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLElement>(null);

  const approval = useUndoableApproval({
    onSent: (c) => {
      setHandled((h) => add(h, c.id));
      setSending((s) => drop(s, c.id));
    },
    onFailed: (c, e) => {
      const err = decisionError(e, "approve");
      setSending((s) => drop(s, c.id));
      if (err.gone) setGoneIds((g) => add(g, c.id));
      if (err.own) setOwnIds((s) => add(s, c.id));
      // Back in the detail, unless you're busy with another one.
      const elsewhere =
        rejectFor !== null ||
        (approval.pending !== null && approval.pending.item.id !== c.id);
      if (!err.gone && !elsewhere) {
        setSelected({ c, mine: err.own });
        setMobileDetail(true);
      }
      toast.show({
        title: err.title,
        body:
          err.gone || err.own
            ? `${correctionTitle(c)}. ${err.body}`
            : `${correctionTitle(c)} is back in the queue. ${err.body}`,
        ms: 8000,
      });
    },
  });

  const all = buildQueue(pending.data ?? [], mine.data ?? []).map((i) =>
    ownIds.has(i.c.id) ? { ...i, mine: true } : i,
  );
  const hidden = (id: string) =>
    handled.has(id) || sending.has(id) || goneIds.has(id);
  const visible = all.filter((i) => !hidden(i.c.id));
  const specialty = norm(user?.specialty);
  const listFor = (f: Filter) =>
    f === "specialty"
      ? visible.filter((i) => norm(i.c.consultation.specialty) === specialty)
      : visible;
  const listed = listFor(filter);

  // With nothing selected, open the next one you can decide (R5).
  const stale =
    selected !== null &&
    (handled.has(selected.c.id) || sending.has(selected.c.id));
  if (filter !== "done" && (selected === null || stale)) {
    const next = listed.length ? pickNext(listed, resumeAt) : null;
    if ((next?.c.id ?? null) !== (selected?.c.id ?? null)) setSelected(next);
  }
  const fresh = selected
    ? all.find((i) => i.c.id === selected.c.id)
    : undefined;
  const current = selected && !stale ? (fresh ?? selected) : null;
  // Decided elsewhere: kept on screen with a notice until you move on (W8).
  const gone =
    current !== null && (fresh === undefined || goneIds.has(current.c.id));
  const index = current ? listed.findIndex((i) => i.c.id === current.c.id) : -1;
  const pendingId = approval.pending?.item.id ?? null;
  const inFlight = [...sending].some((id) => id !== pendingId);
  const busy = reject.isPending || inFlight;
  const canDecide =
    current !== null &&
    !current.mine &&
    !gone &&
    online &&
    !busy &&
    index >= 0 &&
    filter !== "done";

  /** Clear the selection so the one after `id` opens next. */
  function moveOn(id: string) {
    setResumeAt(
      Math.max(
        0,
        listed.findIndex((i) => i.c.id === id),
      ),
    );
    setSelected((s) => (s?.c.id === id ? null : s));
  }

  function approve() {
    if (!canDecide || !current) return;
    approval.start(current.c);
    setSending((s) => add(s, current.c.id));
    moveOn(current.c.id);
    setMobileDetail(true);
  }

  function undo() {
    const item = approval.undo();
    if (!item) return;
    setSending((s) => drop(s, item.id));
    setSelected({ c: item, mine: false });
    const inSpecialty = norm(item.consultation.specialty) === specialty;
    if (filter === "done" || (filter === "specialty" && !inSpecialty))
      setFilter("waiting");
    setMobileDetail(true);
    setRefocus((n) => n + 1);
  }

  // Focus: Undo after Approve, Approve after Undo; the detail once the
  // notice goes away on its own, so focus isn't lost.
  const pendingKey = approval.pending?.key;
  const hadNotice = useRef(false);
  useEffect(() => {
    if (pendingKey) {
      hadNotice.current = true;
      undoRef.current?.focus();
    } else if (hadNotice.current) {
      hadNotice.current = false;
      if (!document.activeElement || document.activeElement === document.body)
        detailRef.current?.focus();
    }
  }, [pendingKey]);
  useEffect(() => {
    if (refocus) approveRef.current?.focus();
  }, [refocus]);

  function openReject() {
    if (!canDecide || !current) return;
    approval.flush();
    setRejectError(null);
    setRejectFor(current);
  }

  function submitReject(r: RejectIn) {
    const target = rejectFor;
    if (!target) return;
    reject.mutate(
      { id: target.c.id, r },
      {
        onSuccess: () => {
          setHandled((h) => add(h, target.c.id));
          setRejectFor(null);
          toast.show({
            title: "Correction rejected",
            body: `${target.c.submitted_by.display_name} will see your reason.`,
            tone: "info",
          });
          moveOn(target.c.id);
        },
        onError: (e) => {
          const err = decisionError(e, "reject");
          // Decided elsewhere: the dialog's own notice says so (W6).
          if (err.gone) setGoneIds((g) => add(g, target.c.id));
          if (err.own) setOwnIds((s) => add(s, target.c.id));
          setRejectError(err.gone ? null : err);
        },
      },
    );
  }

  const withdrawFlow = useWithdrawFlow({
    // Any waiting approval goes first (R1).
    before: () => approval.flush(),
    onDone: (id) => {
      setHandled((h) => add(h, id));
      moveOn(id);
    },
  });

  function openWithdraw() {
    if (!current?.mine || !online || gone || busy) return;
    approval.flush();
    withdrawFlow.ask(current.c.id);
  }

  function select(i: QueueItem) {
    // Opening another one confirms a waiting approval (W20).
    approval.flush();
    setSelected(i);
    setMobileDetail(true);
  }

  function skip() {
    approval.flush();
    if (!listed.length) return;
    setSelected(listed[(index + 1) % listed.length] ?? null);
  }

  function next() {
    approval.flush();
    setResumeAt(0);
    setSelected(null);
  }

  function changeFilter(f: Filter) {
    setFilter(f);
    if (f === "done") return;
    // Only what's listed can be on screen and decided (W7).
    const list = listFor(f);
    if (!selected || !list.some((i) => i.c.id === selected.c.id))
      setSelected(list.length ? pickNext(list, 0) : null);
  }

  useShortcuts({ a: approve, r: openReject });

  if (!user) return null;
  const header = (
    <TopBar
      title="Review corrections"
      sub="Needs a second clinician"
      leading={<MenuButton />}
    />
  );
  const forbidden =
    pending.error instanceof ApiError && pending.error.status === 403;
  if (forbidden)
    return (
      <>
        {header}
        <div className="p-4 md:p-[26px]">
          <Banner
            tone="info"
            title="Reviewing corrections isn't available for your account"
          >
            Ask your hospital admin if you should be a reviewer.
          </Banner>
        </div>
      </>
    );
  if (pending.isPending || mine.isPending)
    return (
      <>
        {header}
        <div aria-busy="true" className="flex flex-col gap-3 p-4 md:p-[26px]">
          <span className="sr-only">Loading corrections</span>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </>
    );
  if (!pending.data)
    return (
      <>
        {header}
        <div className="p-4 md:p-[26px]">
          <Banner tone="bad" title="Couldn't load the corrections">
            Check your connection and try again.
          </Banner>
          <Button
            variant="ghost"
            className="mt-3"
            onClick={() => void pending.refetch()}
          >
            Try again
          </Button>
        </div>
      </>
    );

  const rejectGone =
    rejectFor !== null &&
    (goneIds.has(rejectFor.c.id) ||
      !all.some((i) => i.c.id === rejectFor.c.id));
  const dialogs = (
    <>
      <RejectDialog
        open={rejectFor !== null}
        onClose={() => setRejectFor(null)}
        submitter={rejectFor?.c.submitted_by.display_name ?? ""}
        gone={rejectGone}
        busy={reject.isPending}
        error={rejectError}
        onSubmit={submitReject}
      />
      {withdrawFlow.dialog}
    </>
  );

  if (
    visible.length === 0 &&
    current === null &&
    !approval.pending &&
    filter !== "done"
  )
    return (
      <>
        {header}
        <div className="min-h-0 flex-1 overflow-auto">
          <AllCaughtUp now={now} />
        </div>
        {dialogs}
      </>
    );

  const filters: [Filter, string][] = [
    ["waiting", `Waiting · ${visible.length}`],
    ...(specialty
      ? ([["specialty", "My specialty"]] as [Filter, string][])
      : []),
    ["done", "Done"],
  ];
  const detailShown =
    approval.pending !== null || filter === "done" || current !== null;

  return (
    <>
      {header}
      <div className="grid min-h-0 flex-1 md:grid-cols-[330px_minmax(0,1fr)]">
        <section
          aria-label="Corrections queue"
          className={cn(
            "flex min-h-0 flex-col bg-white/70 md:border-r md:border-line",
            mobileDetail && detailShown && "max-md:hidden",
          )}
        >
          <div className="px-4 pb-2.5 pt-4">
            <p className="text-[12.5px] text-ink-3">
              Each correction needs a second clinician before it changes
              anything.
            </p>
            <div
              role="group"
              aria-label="Show"
              className="mt-3 flex flex-wrap gap-1.5"
            >
              {filters.map(([f, label]) => (
                <FilterChip
                  key={f}
                  pressed={filter === f}
                  onClick={() => changeFilter(f)}
                >
                  {label}
                </FilterChip>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {filter === "done" ? (
              <RecentDecisions items={reviews.data ?? []} now={now} />
            ) : listed.length ? (
              <QueueList
                items={listed}
                selectedId={current?.c.id ?? null}
                now={now}
                onSelect={select}
              />
            ) : (
              <p className="px-4 py-3 text-[13px] text-ink-3">
                {filter === "specialty"
                  ? "Nothing is waiting in your specialty."
                  : "Nothing else is waiting."}
              </p>
            )}
          </div>
        </section>
        <section
          ref={detailRef}
          tabIndex={-1}
          aria-label="Correction details"
          className={cn(
            // The phone decision bar is fixed: leave room so nothing hides behind it.
            "min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 pt-5 outline-none max-md:pb-44 md:px-[26px]",
            !(mobileDetail && detailShown) && "max-md:hidden",
          )}
        >
          {approval.pending ? (
            <UndoNotice
              pending={approval.pending}
              onUndo={undo}
              onNext={next}
              undoRef={undoRef}
            />
          ) : filter === "done" ? (
            <p className="text-[13.5px] text-ink-3">
              Your recent decisions are listed here. Choose Waiting to carry on
              reviewing.
            </p>
          ) : current ? (
            <ReviewDetail
              key={current.c.id}
              item={current}
              now={now}
              position={
                index >= 0 ? { index: index + 1, total: listed.length } : null
              }
              gone={gone}
              online={online}
              busy={busy || (!gone && index < 0)}
              onApprove={approve}
              onReject={openReject}
              onSkip={skip}
              onWithdraw={openWithdraw}
              onBack={() => setMobileDetail(false)}
              onNext={next}
              approveRef={approveRef}
            />
          ) : null}
        </section>
      </div>
      {dialogs}
    </>
  );
}
