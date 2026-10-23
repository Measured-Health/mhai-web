"use client";
import {
  Ban,
  CalendarX,
  CircleCheck,
  CircleX,
  Clock,
  Hourglass,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ClearanceOut } from "@/lib/api/clearances-contract";
import {
  instantLabel,
  safeDayLabel,
  statusLine,
  type StatusIcon as Icon,
  type StatusLine,
} from "@/lib/clearances/status";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";

const ICONS: Record<Icon, LucideIcon> = {
  clock: Clock,
  x: CircleX,
  hourglass: Hourglass,
  check: CircleCheck,
  alert: TriangleAlert,
  ban: Ban,
  "calendar-x": CalendarX,
};

/** A letter's status: always an icon and words, never colour alone. */
export function LetterStatus({ line }: { line: StatusLine }) {
  const I = ICONS[line.icon];
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 font-semibold">
        <I aria-hidden data-icon={line.icon} className="size-4 shrink-0" />
        {line.words}
      </span>
      {line.detail && (
        <span className="text-[12px] text-ink-3 [overflow-wrap:anywhere]">
          {line.detail}
        </span>
      )}
    </span>
  );
}

type Facts = {
  line: StatusLine;
  people: string;
  ends: string;
  uploaded: string;
  verified: string | null;
};

function facts(c: ClearanceOut, today: string): Facts {
  const by = (who: string, at: string) => {
    const day = instantLabel(at);
    return day ? `${who} · ${day}` : who;
  };
  return {
    line: statusLine(c, today),
    people: [
      ...c.covered.map((p) => p.display_name),
      ...c.covered_platform.map((p) => `${p.display_name} (Measured Health)`),
    ].join(", "),
    ends: safeDayLabel(c.end_date) ?? "—",
    uploaded: `Uploaded by ${by(c.uploaded_by.display_name, c.uploaded_at)}`,
    verified:
      c.verified_by && c.verified_at
        ? `Verified by ${by(c.verified_by.display_name, c.verified_at)}`
        : null,
  };
}

/** Newest upload first, whatever order they came in. */
const uploadedMs = (c: ClearanceOut) => {
  const ms = Date.parse(c.uploaded_at);
  return Number.isNaN(ms) ? -Infinity : ms; // an unreadable time goes last
};
const newestFirst = (list: ClearanceOut[]) =>
  [...list].sort((a, b) => {
    const x = uploadedMs(a);
    const y = uploadedMs(b);
    return x === y ? 0 : y > x ? 1 : -1;
  });

type ListProps = {
  letters: ClearanceOut[];
  /** The hospital's day, from the server. */
  today: string;
  onOpen(id: string): void;
};

const HEADERS = ["Status", "People covered", "Ends", "Uploaded", "Verified"];

function LetterTable({ letters, today, onOpen }: ListProps) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <caption className="sr-only">Clearance letters</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
            <th scope="col" className="px-2 py-3">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {letters.map((c) => {
            const f = facts(c, today);
            return (
              <tr
                key={c.id}
                data-letter-id={c.id}
                onClick={() => onOpen(c.id)}
                className="cursor-pointer border-t border-line align-top hover:bg-bg"
              >
                <td className="px-4 py-3">
                  <LetterStatus line={f.line} />
                </td>
                <td className="px-4 py-3 [overflow-wrap:anywhere]">
                  {f.people}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{f.ends}</td>
                <td className="px-4 py-3 text-[12.5px] text-ink-2">
                  {f.uploaded}
                </td>
                <td className="px-4 py-3 text-[12.5px] text-ink-2">
                  {f.verified ?? (
                    <>
                      <span aria-hidden className="text-ink-3">
                        —
                      </span>
                      <span className="sr-only">Not verified</span>
                    </>
                  )}
                </td>
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label={`Open the letter for ${f.people}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(c.id);
                    }}
                    className="inline-flex min-h-11 items-center rounded-xl px-3 text-[13px] font-semibold text-mint-deep hover:bg-lilac focus-visible:outline-2 focus-visible:outline-mint-deep"
                  >
                    Open
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LetterCards({ letters, today, onOpen }: ListProps) {
  return (
    <ul aria-label="Clearance letters" className="flex flex-col gap-2">
      {letters.map((c) => {
        const f = facts(c, today);
        return (
          <li key={c.id}>
            <button
              type="button"
              data-letter-id={c.id}
              onClick={() => onOpen(c.id)}
              className="card-v3 flex min-h-11 w-full flex-col gap-1.5 p-3.5 text-left text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint-deep"
            >
              <LetterStatus line={f.line} />
              <span className="[overflow-wrap:anywhere]">{f.people}</span>
              <span className="text-[12px] text-ink-3">Ends {f.ends}</span>
              <span className="text-[12px] text-ink-3">{f.uploaded}</span>
              {f.verified && (
                <span className="text-[12px] text-ink-3">{f.verified}</span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The hospital's letters, newest first: a table from `md`, cards below.
 * Each opens the letter's details.
 */
export function LetterList({ letters, today, onOpen }: ListProps) {
  const desktop = useIsDesktop();
  const List = desktop ? LetterTable : LetterCards;
  return <List letters={newestFirst(letters)} today={today} onOpen={onOpen} />;
}
