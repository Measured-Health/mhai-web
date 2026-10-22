"use client";
import { useState } from "react";
import type { EmailMode } from "@/lib/api/notifications-contract";
import { EMAIL_MODES } from "@/lib/api/notifications-contract";
import { platformError } from "@/lib/errors";
import { useEmailPref, useSetEmailPref } from "@/lib/queries/email-pref";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { useToast } from "@mhai/ui/toast";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { OfflineNote, useNeedsConnection } from "../states/offline-strip";

const LABEL: Record<EmailMode, string> = {
  off: "Off",
  critical: "Critical only",
  critical_and_digest: "Critical and weekly digest",
};

const HELP =
  "Critical-type changes are sent straight away, at most once a day per hospital and measure. Everything else comes in a weekly summary on Mondays at 08:00 (Lagos time). Emails name the hospital and the change and link here. They never include patient details.";

/** Which analytics emails this platform admin gets. Auditors don't see it. */
export function AnalyticsEmailSection() {
  const pref = useEmailPref();
  const save = useSetEmailPref();
  const toast = useToast();
  const net = useNeedsConnection("email-offline");
  const [choice, setChoice] = useState<EmailMode | null>(null);
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const saved = pref.data;
  const mode = choice ?? saved?.mode ?? "off";
  const dirty = !!saved && mode !== saved.mode;

  const submit = () => {
    if (!saved || !dirty) return;
    setStale(false);
    setFailed(null);
    save.mutate(
      { mode, version: saved.version },
      {
        onSuccess: () => {
          setChoice(null);
          toast.show({
            title: "Email setting saved",
            tone: "ok",
            live: "polite",
          });
        },
        onError: (e) => {
          const w = platformError(e);
          if (w.stale) setStale(true);
          else setFailed(w.title);
        },
      },
    );
  };
  const reload = async () => {
    await pref.refetch();
    setChoice(null);
    setStale(false);
  };

  return (
    <section aria-labelledby="email-h" className="card-v3 px-[22px] py-5">
      <h2 id="email-h" className="text-base font-semibold">
        Analytics email
      </h2>
      {pref.isPending && <Loading label="Loading the email setting" />}
      {pref.isError && (
        <CouldntLoad
          what="the email setting"
          onRetry={() => void pref.refetch()}
        />
      )}
      {saved && (
        <>
          <div
            role="radiogroup"
            aria-labelledby="email-h"
            aria-describedby="email-help"
            className="mt-3 flex flex-col"
          >
            {EMAIL_MODES.map((m) => (
              <label
                key={m}
                className="flex min-h-11 items-center gap-3 text-[14px]"
              >
                <input
                  type="radio"
                  name="analytics-email"
                  value={m}
                  checked={mode === m}
                  {...net.props}
                  disabled={net.offline || save.isPending}
                  onChange={() => setChoice(m)}
                  className="size-4 accent-bloom"
                />
                {LABEL[m]}
              </label>
            ))}
          </div>
          <p id="email-help" className="mt-2 text-[13px] text-ink-3">
            {HELP}
          </p>
          {stale && (
            <div className="mt-3">
              <Banner tone="warn" title="Changed by someone else">
                <p>Reload to see the latest.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => void reload()}
                >
                  Reload
                </Button>
              </Banner>
            </div>
          )}
          {failed && (
            <div className="mt-3">
              <Banner tone="bad" title={failed} />
            </div>
          )}
          <Button
            className="mt-3"
            {...net.props}
            disabled={net.offline || !dirty || save.isPending}
            onClick={submit}
          >
            Save
          </Button>
          <OfflineNote id="email-offline" />
        </>
      )}
    </section>
  );
}
