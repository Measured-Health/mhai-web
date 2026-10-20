import type { ReactNode } from "react";

/** The heading on sign-in and account screens (design v3, account flows). */
export function AuthHeading({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: ReactNode;
}) {
  // First sign-in eyebrows read "Step n of N · …"; they get the design's
  // segmented progress bar above them (account flows 7a–7c).
  const step = eyebrow?.match(/^Step (\d+) of (\d+)/);
  return (
    <header className="mb-6">
      {step && (
        <div aria-hidden className="mb-4 flex gap-1.5">
          {Array.from({ length: Number(step[2]) }, (_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i < Number(step[1]) ? "bg-mint" : "bg-lilac-2"}`}
            />
          ))}
        </div>
      )}
      {eyebrow && (
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
          {eyebrow}
        </p>
      )}
      <h1 className="font-display text-[40px] font-black leading-none">
        {title}
      </h1>
      {sub && <p className="mt-2 text-[14.5px] text-ink-2">{sub}</p>}
    </header>
  );
}
