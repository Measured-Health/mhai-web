import { dateLabel } from "@/lib/format";

/** On every tab (spec §6). Without a date that reads, the date is left out. */
export function AuditFooter({ oldestKeptAt }: { oldestKeptAt: string | null }) {
  const oldest = oldestKeptAt
    ? ` The oldest entry is from ${dateLabel(oldestKeptAt)}.`
    : "";
  return (
    <footer className="border-t border-line pt-4 text-[12.5px] text-ink-3">
      <p>
        {`Kept for at least 6 years.${oldest} No question text, answers or patient names are recorded here. Times on screen are local; files use UTC.`}
      </p>
    </footer>
  );
}
