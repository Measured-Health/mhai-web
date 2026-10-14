import { cn } from "../ui/cn";

export function Segmented<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange(v: T): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-1 rounded-xl bg-lilac p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          name={name}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 flex-1 rounded-[9px] px-1 text-sm text-ink-2 transition-colors duration-[var(--t-fast)]",
            value === o.value &&
              "bg-white font-semibold text-bloom shadow-[0_2px_8px_-4px_#46035155]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
