"use client";
import { isChange, type Notification } from "@/lib/api/notifications-contract";
import { changeLine } from "@/lib/analytics/changes";
import { dayMonthLabel } from "@/lib/format";
import { Button } from "@mhai/ui/button";
import { CouldntLoad } from "../states/couldnt-load";

export const ALL_HOSPITALS = "All hospitals";

/** "21 Oct, 09:30" in the viewer's time. */
export function atLabel(at: string) {
  const t = new Date(at);
  const hm = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  return `${dayMonthLabel(at)}, ${hm}`;
}

/**
 * The bell's list: the newest changes, each with its sign and words, the
 * hospital and the time. A list that can't be read fails whole.
 */
export function NotificationsList({
  items,
  failed,
  loading,
  offline = false,
  fresh,
  unseen,
  onRetry,
  onOpen,
  onMarkAll,
}: {
  items: Notification[];
  failed: boolean;
  loading: boolean;
  /** The first read is waiting for a connection. */
  offline?: boolean;
  /** Ids that were unseen when the list opened. */
  fresh: ReadonlySet<string>;
  /** The count of unseen; Mark all seen shows only while there are some. */
  unseen: number;
  onRetry(): void;
  onOpen(n: Notification): void;
  onMarkAll(): void;
}) {
  if (failed) return <CouldntLoad what="notifications" onRetry={onRetry} />;
  if (offline)
    return (
      <p className="text-[14px] text-ink-2">
        You&apos;re offline. Notifications will load when you&apos;re back
        online.
      </p>
    );
  if (loading) return <p className="text-[14px] text-ink-3">Loading…</p>;
  return (
    <div>
      {items.length === 0 ? (
        <p className="py-3 text-[14px] text-ink-2">Nothing new</p>
      ) : (
        <ul
          aria-label="New usage changes"
          className="flex max-h-[60vh] flex-col overflow-auto"
        >
          {items.map((n) => {
            if (!isChange(n))
              return (
                <li key={n.id} className="border-t border-line first:border-0">
                  <button
                    type="button"
                    onClick={() => onOpen(n)}
                    className="flex min-h-11 w-full gap-2.5 rounded-lg px-1 py-2.5 text-left text-[13.5px] hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        ⚠ The audit log failed its integrity check
                      </span>
                      <span className="mt-0.5 block font-mono text-xs text-ink-3">
                        Platform · {atLabel(n.at)} · Security
                        {fresh.has(n.id) && " · New"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            const { sign, words } = changeLine(n);
            return (
              <li key={n.id} className="border-t border-line first:border-0">
                <button
                  type="button"
                  onClick={() => onOpen(n)}
                  className="flex min-h-11 w-full gap-2.5 rounded-lg px-1 py-2.5 text-left text-[13.5px] hover:bg-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep"
                >
                  <span aria-hidden className="w-4 shrink-0 text-center">
                    {sign}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block">{words}</span>
                    <span className="mt-0.5 block font-mono text-xs text-ink-3">
                      {n.hospital?.name ?? ALL_HOSPITALS} · {atLabel(n.at)}
                      {n.serious && " · Critical"}
                      {fresh.has(n.id) && " · New"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {unseen > 0 && (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            Mark all seen
          </Button>
        </div>
      )}
    </div>
  );
}
