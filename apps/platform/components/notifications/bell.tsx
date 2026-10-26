"use client";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { isChange, type Notification } from "@/lib/api/notifications-contract";
import { openAuditAt } from "@/lib/audit/nav";
import { useAuth } from "@/lib/auth/auth-context";
import { useMarkSeen, useNotifications } from "@/lib/queries/notifications";
import { Dialog } from "@mhai/ui/dialog";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { Sheet } from "@mhai/ui/sheet";
import { useToast } from "@mhai/ui/toast";
import { NotificationsList } from "./notifications-list";

const NONE: ReadonlySet<string> = new Set();

/** The label: "Notifications, {n} new", or "Notifications". */
export const bellLabel = (n: number) =>
  n > 0 ? `Notifications, ${n} new` : "Notifications";

/**
 * The top bar's bell, for every signed-in role: a count of the
 * changes this person hasn't seen, and a list of the newest.
 */
export function NotificationBell() {
  const { user } = useAuth();
  return user ? <BellAndList /> : null;
}

function BellAndList() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const q = useNotifications();
  const mark = useMarkSeen();
  const [open, setOpen] = useState(false);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(NONE);
  const trigger = useRef<HTMLButtonElement>(null);
  const toast = useToast();

  // The last good count stays through a failed check; no count before one.
  const unseen = q.data?.unseen ?? 0;
  // A failed read fails the list, even with an older one in hand.
  const failed = open && (q.isError || (!!q.data && !q.data.ok));
  const items = q.data?.ok ? q.data.items : [];
  // The first read is waiting for a connection: say so, not "Loading…".
  const waiting = open && !q.data && q.fetchStatus === "paused";

  // Opening looks again, then marks what that reply shows as seen (from
  // the reply itself, never a possibly stale cache read).
  const openList = () => {
    setOpen(true);
    void q.refetch().then((r) => {
      if (r.isError || !r.data?.ok) return;
      const ids = r.data.items.filter((i) => !i.seen).map((i) => i.id);
      setFresh(new Set(ids));
      if (ids.length) mark.mutate(ids);
    });
  };
  const markAll = () =>
    mark.mutate(undefined, {
      onError: () =>
        toast.show({ title: "Couldn't mark them seen. Try again." }),
    });

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const go = (n: Notification) => {
    close();
    if (!isChange(n)) {
      // The tab goes by memory, never the URL.
      openAuditAt("integrity");
      router.push("/audit");
      return;
    }
    router.push(`/usage?change=${encodeURIComponent(n.change_id)}`);
  };

  const body = (
    <NotificationsList
      items={items}
      failed={failed}
      loading={open && q.isPending && !waiting}
      offline={waiting}
      fresh={fresh}
      onRetry={() => void q.refetch()}
      onOpen={go}
      unseen={unseen}
      onMarkAll={markAll}
    />
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={bellLabel(unseen)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openList}
        className="relative grid size-11 place-items-center rounded-xl border border-white/30 text-white focus-visible:outline-2 focus-visible:outline-white md:size-[34px] md:rounded-[10px]"
      >
        <Bell aria-hidden className="size-4" />
        {unseen > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-bad-deep px-1 font-mono text-[10px] font-bold text-white"
          >
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>
      {desktop ? (
        <Dialog open={open} onClose={close} title="Notifications">
          {open && body}
        </Dialog>
      ) : (
        <Sheet open={open} onClose={close} title="Notifications">
          {open && body}
        </Sheet>
      )}
    </>
  );
}
