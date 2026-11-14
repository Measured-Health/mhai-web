import { NOT_AVAILABLE } from "@/lib/errors";

/**
 * Core answers this but doesn't do it yet (501 `not_implemented`): a calm
 * note, not an error. Nothing to retry, nothing went wrong.
 */
export function NotAvailable({
  what,
}: {
  /** e.g. "notifications" */ what: string;
}) {
  return (
    <div
      role="status"
      className="rounded-2xl border border-dashed border-lilac-2 bg-white px-5 py-6"
    >
      <h2 className="text-[14px] font-semibold">{NOT_AVAILABLE}</h2>
      <p className="mt-1 text-[13.5px] text-ink-2">
        Measured Health hasn&apos;t switched on {what} yet. Nothing is wrong.
      </p>
    </div>
  );
}
