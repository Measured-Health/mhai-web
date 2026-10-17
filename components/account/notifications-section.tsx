"use client";
import { useId } from "react";
import { useOnline } from "@/lib/hooks/use-online";
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from "@/lib/notification-queries";
import { Banner } from "../ui/banner";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Switch } from "../ui/switch";

const row =
  "flex min-h-14 flex-wrap items-center gap-3 border-t border-line py-3 text-[14px]";

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
              onChange={(v) => save.mutate({ alert_popups: v })}
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
              onChange={(v) => save.mutate({ correction_popups: v })}
            />
          </div>
          {!online && (
            <p id={`${id}-offline`} className="mt-2 text-[13px] text-ink-3">
              You&apos;re offline. Changes need a connection.
            </p>
          )}
          {save.isError && (
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
            {save.isSuccess ? "Saved" : null}
          </p>
          <p className="text-[12px] text-ink-3">
            Saved with your account, so they follow you to any device.
          </p>
        </>
      )}
    </section>
  );
}
