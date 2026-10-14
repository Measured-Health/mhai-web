import { cn } from "./cn";

const HEIGHTS = [6, 8, 10, 12, 14];

export function ConfidencePill({
  label,
  bars,
}: {
  label: string;
  bars: 1 | 2 | 3 | 4 | 5;
}) {
  const tone = label.startsWith("High")
    ? "bg-ok-wash text-ok-deep"
    : "bg-warn-wash text-warn-deep";
  const word = label.replace(/ confidence$/, "");
  return (
    <span
      role="status"
      aria-label={`${label}, ${bars} of 5 bars`}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold",
        tone,
      )}
    >
      <span aria-hidden className="inline-flex items-end gap-0.5">
        {HEIGHTS.map((h, i) => (
          <i
            key={h}
            data-bar={i < bars ? "on" : "off"}
            style={{ height: h }}
            className={cn(
              "block w-1 rounded-sm bg-current",
              i >= bars && "opacity-20",
            )}
          />
        ))}
      </span>
      {word}
      {label.endsWith("confidence") && (
        <span
          aria-hidden
          className="text-[9.5px] font-semibold uppercase tracking-[.12em] opacity-70"
        >
          confidence
        </span>
      )}
    </span>
  );
}
