import type { Urgency } from "@/lib/api/contract";
import { cn } from "../ui/cn";

const OPTS: { value: Urgency; label: string; hint: string; dot: string }[] = [
  { value: "routine", label: "Routine", hint: "Clinic visit", dot: "bg-mint" },
  { value: "urgent", label: "Urgent", hint: "Same day", dot: "bg-warn" },
  { value: "emergency", label: "Emergency", hint: "Act now", dot: "bg-bad" },
];

export function PriorityPicker({
  value,
  onChange,
  invalid,
  describedBy,
}: {
  invalid?: boolean;
  describedBy?: string;
  value: Urgency | "";
  onChange(v: Urgency): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby="l-urgency"
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="grid grid-cols-3 gap-2"
    >
      {OPTS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex min-h-12 items-center gap-2 rounded-xl border border-lilac-2 bg-white px-3 py-2.5 text-left text-sm",
            value === o.value && "border-mint ring-[3px] ring-mint/15",
          )}
        >
          <span aria-hidden className={cn("size-2 rounded-full", o.dot)} />
          <span>
            {o.label}
            <small className="block text-[11px] text-ink-3">{o.hint}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
