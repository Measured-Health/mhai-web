"use client";
import { CloudUpload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOutbox } from "@/lib/offline/outbox-context";
import { useSession, type SessionItem } from "@/lib/session-store";
import { Button } from "../ui/button";

/**
 * A question saved offline, before it reaches the server. Shown in place on
 * the home page (offline navigation can't load another page) and on
 * /c/local-… when opened from history.
 */
export function WaitingToSend({
  item,
  onEdit,
  onDeleted,
}: {
  item: SessionItem;
  /** Defaults to opening the pre-filled form at /?edit=<id>. */
  onEdit?(): void;
  /** Defaults to going home. */
  onDeleted?(): void;
}) {
  const { discard } = useOutbox();
  const { remove } = useSession();
  const router = useRouter();
  const failed = item.pending === "failed";
  return (
    <div className="mx-auto mt-10 max-w-[560px] text-center" role="status">
      <div
        aria-hidden
        className="mx-auto mb-4 grid size-16 place-items-center rounded-3xl bg-lilac text-bloom"
      >
        <CloudUpload className="size-7" />
      </div>
      <h2 className="font-display text-[36px] font-black leading-none">
        {failed ? "Couldn't send" : "Waiting to send"}
      </h2>
      <p className="mx-auto my-3 max-w-[460px] leading-relaxed text-ink-2">
        {failed
          ? "The server didn't accept this question. Check it, then send it again."
          : "You're offline. This question is saved securely on this device and will be analysed as soon as you're back online."}
      </p>
      <div className="flex justify-center gap-2">
        <Button
          variant="ghost"
          onClick={onEdit ?? (() => router.push(`/?edit=${item.id}`))}
        >
          Edit question
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            await discard(item.id);
            remove(item.id);
            if (onDeleted) onDeleted();
            else router.push("/");
          }}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
