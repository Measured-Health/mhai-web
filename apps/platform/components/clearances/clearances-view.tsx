"use client";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ClearanceTab } from "@/lib/api/clearances-contract";
import { useNamedAccessState } from "@/lib/queries/clearances";
import { Button } from "@mhai/ui/button";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Empty } from "../states/empty";
import { Loading } from "../states/loading";
import { ClearanceDetail } from "./clearance-detail";
import { ClearanceQueue } from "./clearance-queue";
import { SwitchPanel } from "./switch-panel";

/**
 * The Clearances page: the named-access switch at the top, then the
 * hospitals' clearance letters, to verify, reject or revoke. With the global
 * switch Off there is nothing to verify, so the queue gives way to a line
 * saying so. On a phone the queue shows alone and a letter opens in its
 * place, with Back. The open letter lives in this component's state, never
 * in the URL.
 */
export function ClearancesView() {
  const desktop = useIsDesktop();
  const named = useNamedAccessState();
  const [tab, setTab] = useState<ClearanceTab>("waiting");
  const [selected, setSelected] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  // After Back on a phone, the row the person came from gets the focus.
  const backTo = useRef<string | null>(null);
  // On a phone, a letter opened in the queue's place starts at Back.
  const backButton = useRef<HTMLButtonElement>(null);
  const focusBack = useRef(false);
  useEffect(() => {
    if (focusBack.current && backButton.current) {
      backButton.current.focus();
      focusBack.current = false;
    }
    if (backTo.current === null) return;
    const row = rowRefs.current.get(backTo.current);
    if (row) {
      row.focus();
      backTo.current = null;
    }
  });

  const off = named.data?.global.position === "off";
  const queue = (
    <ClearanceQueue
      tab={tab}
      onTab={setTab}
      selected={selected}
      onSelect={(id) => {
        focusBack.current = !desktop;
        setSelected(id);
      }}
      rowRefs={rowRefs}
    />
  );

  let body: ReactNode;
  if (named.isError && !named.data)
    body = (
      <CouldntLoad what="named access" onRetry={() => void named.refetch()} />
    );
  else if (!named.data)
    body =
      named.fetchStatus === "paused" ? (
        <div
          role="status"
          className="card-v3 p-6 text-center text-[14px] text-ink-2"
        >
          You&apos;re offline. Letters will load when you reconnect.
        </div>
      ) : (
        <Loading label="Loading letters" />
      );
  else if (off)
    body = (
      <Empty title="Named access isn't available yet">
        Letters can be verified once named access is switched on for every
        hospital.
      </Empty>
    );
  else if (desktop)
    body = (
      <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-start">
        {queue}
        {selected ? (
          <ClearanceDetail key={selected} id={selected} />
        ) : (
          <div className="rounded-2xl border border-dashed border-lilac-2 bg-white px-6 py-10 text-center text-[13.5px] text-ink-3">
            Choose a letter to see what was entered
          </div>
        )}
      </div>
    );
  else
    body = selected ? (
      <div className="flex flex-col gap-3">
        <div>
          <Button
            ref={backButton}
            variant="ghost"
            onClick={() => {
              backTo.current = selected;
              setSelected(null);
            }}
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back
          </Button>
        </div>
        <ClearanceDetail key={selected} id={selected} />
      </div>
    ) : (
      queue
    );

  return (
    <>
      <TopBar
        title="Clearances"
        sub="Hospitals' letters for seeing patient names"
      />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-6 md:px-[26px]">
        <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
          <SwitchPanel />
          {body}
        </div>
      </div>
    </>
  );
}
