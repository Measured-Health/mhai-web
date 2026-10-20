"use client";
import { useModLabel } from "@/lib/hooks/use-shortcuts";
import { Dialog } from "../ui/dialog";

export function ShortcutsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  const mod = useModLabel();
  const rows: [string, string][] = [
    ["Search / commands", `${mod} K`],
    ["New consultation", "N"],
    ["Submit form", `${mod} ↵`],
    ["Toggle evidence panel", "E"],
    ["Agree with result (not on Needs review)", "A"],
    ["Suggest correction", "C"],
    ["Copy result", "⇧ C"],
    ["Print / export", `${mod} P`],
    ["Approve correction (in review)", "A"],
    ["Reject correction (in review)", "R"],
    ["Show shortcuts", "?"],
  ];
  return (
    <Dialog open={open} onClose={onClose} title="Keyboard shortcuts">
      <p className="mb-4 text-sm text-ink-2">
        Work faster without the mouse. Result shortcuts work on a completed
        result.
      </p>
      <dl className="grid grid-cols-1 gap-x-7 sm:grid-cols-2">
        {rows.map(([d, k]) => (
          <div
            key={d}
            className="flex items-center justify-between border-b border-line py-2 text-[13.5px] text-ink-2"
          >
            <dt>{d}</dt>
            <dd>
              <kbd className="rounded-md border border-b-2 border-lilac-2 bg-white px-1.5 font-mono text-[11px]">
                {k}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 rounded-full bg-mint px-5 font-semibold text-white"
        >
          Done
        </button>
      </div>
    </Dialog>
  );
}
