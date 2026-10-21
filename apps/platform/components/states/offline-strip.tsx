"use client";
import { WifiOff } from "lucide-react";
import { useOnline } from "@mhai/ui/hooks/use-online";

export const OFFLINE_NOTE = "You're offline. This needs a connection.";

/**
 * For an action that needs the network: spread `props` on the button
 * (disabled, a title and a pointer to the visible reason) and render
 * <OfflineNote id={id} /> near it.
 */
export function useNeedsConnection(id = "offline-note") {
  const online = useOnline();
  return online
    ? { offline: false, props: {} as Props }
    : {
        offline: true,
        props: {
          disabled: true,
          title: OFFLINE_NOTE,
          "aria-describedby": id,
        } as Props,
      };
}
type Props = {
  disabled?: boolean;
  title?: string;
  "aria-describedby"?: string;
};

/** The reason an action is off, visible and read out by screen readers. */
export function OfflineNote({ id = "offline-note" }: { id?: string }) {
  return useOnline() ? null : (
    <p id={id} className="mt-2 text-[13px] text-ink-3">
      {OFFLINE_NOTE}
    </p>
  );
}

export function OfflineStrip() {
  return useOnline() ? null : (
    <div
      role="status"
      className="flex items-center gap-2.5 bg-ink px-4 py-2 text-[13px] text-white md:px-[26px]"
    >
      <WifiOff aria-hidden className="size-4 shrink-0" />
      You&apos;re offline. Showing what&apos;s already loaded. Actions that
      change something are paused until you&apos;re back online.
    </div>
  );
}
