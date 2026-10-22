"use client";
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { AuditTab } from "@/lib/audit/nav";
import { cn } from "@mhai/ui/cn";

/** The tabs in order. Each later tab adds its entry here. */
export const TABS: readonly { key: AuditTab; label: string }[] = [
  { key: "events", label: "Events" },
  { key: "exports", label: "Exports" },
];

/** The tab to show: one that exists, else Events. */
export const shownTab = (t: AuditTab): AuditTab =>
  TABS.some((x) => x.key === t) ? t : "events";

/**
 * The audit log's tabs: a tablist with arrow-key movement (Home and End
 * too). The open tab is held by the audit view, so the header line and the
 * hand-off from the bell and banner can open one; it is never in the URL.
 */
export function AuditTabs({
  tab,
  onTab,
  children,
}: {
  tab: AuditTab;
  onTab(t: AuditTab): void;
  children(tab: AuditTab): ReactNode;
}) {
  const base = useId();
  const refs = useRef(new Map<AuditTab, HTMLButtonElement>());
  const current = shownTab(tab);

  function move(e: KeyboardEvent, i: number) {
    const n = TABS.length;
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowLeft"
          ? (i + n - 1) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    const next = TABS[to]!.key;
    onTab(next);
    refs.current.get(next)?.focus();
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Audit log"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map(({ key, label }, i) => (
          <button
            key={key}
            ref={(el) => {
              if (el) refs.current.set(key, el);
              else refs.current.delete(key);
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${key}`}
            aria-selected={current === key}
            aria-controls={current === key ? `${base}-panel` : undefined}
            tabIndex={current === key ? 0 : -1}
            onClick={() => onTab(key)}
            onKeyDown={(e) => move(e, i)}
            className={cn(
              "min-h-11 shrink-0 border-b-2 px-3 text-[14px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-mint-deep",
              current === key
                ? "border-mint-deep text-ink"
                : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${base}-panel`}
        aria-labelledby={`${base}-tab-${current}`}
      >
        {children(current)}
      </div>
    </div>
  );
}
