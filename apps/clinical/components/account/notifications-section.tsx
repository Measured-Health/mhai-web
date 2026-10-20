"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { NotificationSettingsPatchIn } from "@/lib/api/alerts-contract";
import { useOnline } from "@mhai/ui/hooks/use-online";
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/lib/notification-queries";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { Skeleton } from "@mhai/ui/skeleton";
import { Switch } from "@mhai/ui/switch";

const row =
  "flex min-h-14 flex-wrap items-center gap-3 border-t border-line py-3 text-[14px]";

/** How long "Saved" stays after a save lands (F17). */
export const SAVED_MS = 4000;

/**
 * Profile & security → Notifications (spec §4): what pops up. The bell and
 * the Notifications page update either way, and Critical alerts always pop
 * up. Saved with the account (R5). The switches follow the settings cache,
 * which changes at once when you flip one (B3) and goes back if the save
 * fails; they only show once the saved settings have loaded, so none is
 * ever toggled from a guessed state.
 */
export function NotificationsSection() {
  const q = useNotificationSettings();
  const save = useUpdateNotificationSettings();
  const online = useOnline();
  const id = useId();
  const value = q.data ?? null;
  // Per save, so one that fails while a later one lands is still reported (F17).
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), SAVED_MS);
    return () => clearTimeout(t);
  }, [saved]);
  // Saves still on their way. mutate()'s own callbacks only hear the latest
  // call, so each save's promise is followed instead.
  const inflight = useRef(0);
  const change = (p: NotificationSettingsPatchIn) => {
    inflight.current += 1;
    setFailed(false);
    setSaved(false);
    save.mutateAsync(p).then(
      () => {
        inflight.current -= 1;
        // "Saved" once nothing else is still saving.
        if (inflight.current === 0) setSaved(true);
      },
      () => {
        inflight.current -= 1;
        setFailed(true);
        setSaved(false);
      },
    );
  };
  const offline = online ? undefined : `${id}-offline`;
  const describedBy = (hint: string) =>
    [hint, offline].filter(Boolean).join(" ");

  return (
    <section
      id="notifications"
      aria-labelledby={`${id}-h`}
      className="card-v3 scroll-mt-4 px-[22px] py-5"
    >
      <h2 id={`${id}-h`} className="text-base font-semibold">
        Notifications
      </h2>
      <p className="mb-3.5 mt-1 text-[13px] text-ink-3">
        Choose what pops up. The bell and the Notifications page always update.
      </p>
      {!value && q.isError ? (
        <div>
          <Banner tone="bad" title="Couldn't load your notification settings">
            Check your connection and try again.
          </Banner>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => void q.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : !value ? (
        <div aria-busy="true">
          <span className="sr-only">Loading your notification settings</span>
          <Skeleton className="h-[112px]" />
        </div>
      ) : (
        <>
          <div className={row}>
            <span className="min-w-0 flex-1 basis-[220px]">
              Pop-ups for patient alerts
              <small
                id={`${id}-alerts`}
                className="block text-[12px] text-ink-3"
              >
                {value.alert_popups
                  ? "New patient alerts pop up on any screen. If you turn this off, Critical alerts will still pop up."
                  : "Critical alerts will still pop up."}
              </small>
            </span>
            <Switch
              label="Pop-ups for patient alerts"
              checked={value.alert_popups}
              disabled={!online}
              describedBy={describedBy(`${id}-alerts`)}
              onChange={(v) => change({ alert_popups: v })}
            />
          </div>
          <div className={row}>
            <span className="min-w-0 flex-1 basis-[220px]">
              Pop-ups for decisions on my corrections
              <small
                id={`${id}-decisions`}
                className="block text-[12px] text-ink-3"
              >
                When a reviewer approves or rejects a correction you suggested.
              </small>
            </span>
            <Switch
              label="Pop-ups for decisions on my corrections"
              checked={value.correction_popups}
              disabled={!online}
              describedBy={describedBy(`${id}-decisions`)}
              onChange={(v) => change({ correction_popups: v })}
            />
          </div>
          {!online && (
            <p id={`${id}-offline`} className="mt-2 text-[13px] text-ink-3">
              You&apos;re offline. Changes need a connection.
            </p>
          )}
          {failed && (
            <div className="mt-3">
              <Banner
                tone="bad"
                title="Couldn't save your notification settings"
              >
                Your change wasn&apos;t saved. Check your connection and try
                again.
              </Banner>
            </div>
          )}
          {/* Polite: "Saved" is announced only once the save has landed. */}
          <p role="status" className="mt-3 text-[12px] text-ink-3">
            {saved && !failed ? "Saved" : null}
          </p>
          <p className="text-[12px] text-ink-3">
            Kept with your account, so they follow you to any device.
          </p>
        </>
      )}
    </section>
  );
}
