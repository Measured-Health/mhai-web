import type { ReactNode } from "react";

export type Fact = { label: string; value: ReactNode };

/**
 * One card per hospital (or for the median of all of them): a name and its
 * numbers as label and value pairs. Stacks on a phone.
 */
export function FactsList({
  label,
  cards,
}: {
  label: string;
  cards: { key: string; name: string; note?: string; facts: Fact[] }[];
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {cards.map((c) => (
        <li
          key={c.key}
          aria-label={c.name}
          className="rounded-xl border border-line px-4 py-3"
        >
          <p className="text-[14px] font-semibold [overflow-wrap:anywhere]">
            {c.name}
          </p>
          {c.note && <p className="text-[12.5px] text-ink-3">{c.note}</p>}
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
            {c.facts.map((f) => (
              <div key={f.label} className="flex justify-between gap-3">
                <dt className="text-ink-2">{f.label}</dt>
                <dd className="text-right font-mono">{f.value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}
