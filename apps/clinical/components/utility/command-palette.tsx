"use client";
import { useMemo, useRef, useState } from "react";
import { HelpCircle, Plus, Search, Stethoscope } from "lucide-react";
import { useEscape } from "@mhai/ui/hooks/use-escape";
import { useFocusTrap } from "@mhai/ui/hooks/use-focus-trap";
import {
  historyStatus,
  useSession,
  type SessionItem,
} from "@/lib/session-store";
import { useShell } from "../shell/app-shell";
import { cn } from "@mhai/ui/cn";

/** Matches title, diagnosis, symptoms, specialty and the plain-language result label. */
export function searchItems(items: SessionItem[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return items;
  return items.filter((i) =>
    [
      i.title,
      i.diagnosis ?? "",
      ...i.query.patient_data.symptoms,
      i.query.specialty ?? "",
      i.kind ? historyStatus(i).label : "",
    ].some((f) => f.toLowerCase().includes(t)),
  );
}

type Row = {
  key: string;
  label: string;
  sub?: string;
  icon: typeof Plus;
  href: string;
};

/** The modal body is mounted only while open, so each open starts with an empty query. */
function PaletteBody({ onClose }: { onClose(): void }) {
  const { navigate } = useShell();
  const { items } = useSession();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  useEscape(true, onClose);
  useFocusTrap(true, panel);

  const rows: Row[] = useMemo(
    () => [
      ...searchItems(items, q)
        .slice(0, 6)
        .map((i) => ({
          key: i.id,
          label: i.title,
          sub: historyStatus(i).label,
          icon: Stethoscope,
          href: `/c/${i.id}`,
        })),
      ...[
        { key: "new", label: "New consultation", icon: Plus, href: "/" },
        { key: "help", label: "Help & guide", icon: HelpCircle, href: "/help" },
      ].filter(
        (a) =>
          !q.trim() || a.label.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    ],
    [items, q],
  );
  const run = (r?: Row) => {
    if (!r) return;
    onClose();
    navigate(r.href);
  };
  const active = Math.min(sel, Math.max(rows.length - 1, 0));
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-ink/40 px-4 pt-[12vh] backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(620px,100%)] overflow-hidden rounded-[22px] bg-white shadow-[0_40px_80px_-30px_#1c0d22aa]"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-4">
          <Search aria-hidden className="size-5 text-ink-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Search consultations or type a command"
            aria-label="Search consultations or type a command"
            role="combobox"
            aria-expanded
            aria-controls="cmdk-list"
            aria-activedescendant={
              rows[active] ? `cmdk-${rows[active].key}` : undefined
            }
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel(Math.min(active + 1, rows.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel(Math.max(active - 1, 0));
              }
              if (e.key === "Enter") {
                // No keypress: focus may move to a guard prompt's button,
                // which this Enter must not activate.
                e.preventDefault();
                run(rows[active]);
              }
            }}
            className="flex-1 bg-transparent text-[17px] outline-none"
          />
          <kbd className="rounded-md border border-b-2 border-lilac-2 px-1.5 font-mono text-[11px] text-ink-3">
            esc
          </kbd>
        </div>
        <ul
          id="cmdk-list"
          role="listbox"
          className="max-h-[50vh] overflow-auto py-2"
        >
          {rows.length === 0 && (
            <li className="px-[18px] py-3 text-sm text-ink-3">
              No matches in this session.
            </li>
          )}
          {rows.map((r, i) => (
            <li
              key={r.key}
              id={`cmdk-${r.key}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setSel(i)}
              onClick={() => run(r)}
              className={cn(
                "flex cursor-pointer items-center gap-3 px-[18px] py-2.5 text-sm",
                i === active && "bg-mint-wash",
              )}
            >
              <span
                aria-hidden
                className="grid size-[30px] place-items-center rounded-[9px] bg-lilac text-bloom"
              >
                <r.icon className="size-4" />
              </span>
              <span>
                {r.label}
                {r.sub && (
                  <small className="block text-xs text-ink-3">{r.sub}</small>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="flex gap-4 border-t border-line px-[18px] py-2.5 text-[11.5px] text-ink-3">
          <span>↑ ↓ move</span>
          <span>↵ open</span>
          <span>esc close</span>
        </p>
      </div>
    </div>
  );
}

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}) {
  return open ? <PaletteBody onClose={onClose} /> : null;
}
