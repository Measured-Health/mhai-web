"use client";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelRight } from "lucide-react";
import type { Stage } from "@/lib/api/contract";
import { HighlightProvider } from "@/lib/highlight";
import { useNow } from "@mhai/ui/hooks/use-now";
import { useShortcuts } from "@/lib/hooks/use-shortcuts";
import { useOutbox } from "@/lib/offline/outbox-context";
import { useQueryStatus, useResult, useSubmitQuery } from "@/lib/queries";
import { toResultView } from "@/lib/result-view";
import { useSession } from "@/lib/session-store";
import { EvidenceDock } from "../evidence/evidence-dock";
import { YourQuestionPanel } from "../form/side-panels";
import { ExportMenu, type ExportMenuHandle } from "../feedback/export-menu";
import { FeedbackBar, type FeedbackBarHandle } from "../feedback/feedback-bar";
import { ProcessingView } from "../processing/processing-view";
import { parseBody } from "../result/parse-body";
import { ResultCard } from "../result/result-card";
import { ResultSkeleton } from "../result/result-skeleton";
import { useShell } from "../shell/app-shell";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { FailedView } from "../states/failed-view";
import { WaitingToSend } from "./waiting-to-send";

/** Ticks its own clock so only this part re-renders while analysing. */
function Analysing({
  stage,
  progress,
  startedAt,
}: {
  stage: Stage | null;
  progress: number;
  startedAt: number;
}) {
  const now = useNow(200);
  return (
    <ProcessingView
      stage={stage}
      progress={progress}
      elapsedMs={now - startedAt}
    />
  );
}

/** One consultation: analysing → result, or Couldn't complete (failed or stalled). */
export function ConsultationView({ id }: { id: string }) {
  // Every hook runs before the not-found exit below (rules of hooks).
  const router = useRouter();
  const { navigate } = useShell();
  const { get, update } = useSession();
  const item = get(id);
  // A question saved offline that has since reached the server.
  const real = useOutbox().resolved[id];
  const st = useQueryStatus(id);
  const result = useResult(id, st.status === "completed");
  const resubmit = useSubmitQuery();
  const [panel, setPanel] = useState(true);
  const fbRef = useRef<FeedbackBarHandle>(null);
  const exRef = useRef<ExportMenuHandle>(null);

  const data = result.data;
  const view = useMemo(() => (data ? toResultView(data) : null), [data]);
  const parsed = useMemo(
    () => (data ? parseBody(data.response_text, data.citations) : null),
    [data],
  );
  const done = view !== null && parsed !== null;
  const failed = st.status === "failed" || st.stalled || result.isError;
  const diagnosis = data?.diagnosis ?? undefined;

  useShortcuts(
    done
      ? {
          e: () => setPanel((p) => !p),
          // A one-key sign-off on a Needs-review result is too easy to
          // trigger (and it prints): "Mark as reviewed" needs the button.
          a: () => {
            if (view.kind !== "review") fbRef.current?.agree();
          },
          c: () => fbRef.current?.correct(),
          "shift+c": () => exRef.current?.copy(),
          // Through the shell's guard: a correction being typed prompts first.
          "mod+p": () => navigate(`/print/${id}`),
        }
      : {},
  );

  useEffect(() => {
    if (view)
      update(id, {
        kind: view.kind,
        // What the screen showed, so history never labels a level it hid.
        confidenceLabel: view.confidence?.label ?? null,
        flagged: view.kind !== "high",
        // Without a diagnosis keep the symptom title rather than a generic one.
        ...(diagnosis ? { title: view.title, diagnosis } : {}),
      });
    else if (failed) update(id, { kind: "failed" });
  }, [id, view, failed, diagnosis, update]);

  useEffect(() => {
    if (real) router.replace(`/c/${real}`);
  }, [real, router]);

  if (real) return null; // on the way to /c/<real id>
  // Unknown id, or a consultation from a session that has ended.
  if (!item) notFound();

  if (item.pending)
    return (
      <>
        <TopBar
          title={item.title}
          urgency={item.urgency}
          leading={<MenuButton />}
        />
        <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
          <WaitingToSend item={item} />
        </div>
      </>
    );

  const analysing = !failed && !done && st.status !== "completed";
  return (
    <HighlightProvider>
      <TopBar
        title={item.title}
        urgency={item.urgency}
        sub={
          done
            ? `Completed in ${view.seconds} s`
            : `Started ${new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        }
        leading={<MenuButton />}
        actions={
          done && (
            <button
              type="button"
              aria-pressed={panel}
              onClick={() => setPanel((p) => !p)}
              className="hidden h-[34px] items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[12.5px] text-ink-2 lg:flex"
            >
              <PanelRight aria-hidden className="size-4" />
              Evidence panel
            </button>
          )
        }
      />
      <div
        className={
          (done && panel) || analysing
            ? "grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]"
            : "flex min-h-0 flex-1"
        }
      >
        {/* Bottom room below lg for the fixed evidence summary bar (bottom-[88px] / md:bottom-5). */}
        <div className="min-w-0 flex-1 overflow-auto px-4 pb-44 pt-7 md:px-[26px] md:pb-28 lg:pb-10">
          {failed ? (
            <FailedView
              stalled={st.stalled}
              retrying={resubmit.isPending}
              retryError={resubmit.isError}
              onRetry={() =>
                resubmit.mutate(item.query, {
                  onSuccess: ({ query_id }) => router.replace(`/c/${query_id}`),
                })
              }
              onEdit={() => router.push(`/?edit=${id}`)}
            />
          ) : done ? (
            <ResultCard
              view={view}
              parsed={parsed}
              actions={
                <FeedbackBar
                  ref={fbRef}
                  queryId={id}
                  view={view}
                  trailing={
                    <ExportMenu
                      ref={exRef}
                      queryId={id}
                      view={view}
                      parsed={parsed}
                    />
                  }
                />
              }
            />
          ) : st.status === "completed" ? (
            // Result is still being fetched (failure is handled above).
            <ResultSkeleton />
          ) : (
            <Analysing
              stage={st.stage}
              progress={st.progress}
              startedAt={item.createdAt}
            />
          )}
        </div>
        {done && <EvidenceDock view={view} open={panel} />}
        {analysing && <YourQuestionPanel query={item.query} />}
      </div>
    </HighlightProvider>
  );
}
