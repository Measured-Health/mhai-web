/* eslint-disable @next/next/no-img-element -- small static brand assets */
export function Logo({ className = "h-11 w-auto" }: { className?: string }) {
  return (
    <img src="/brand/logo.png" alt="Measured Health" className={className} />
  );
}

export function Mark({ className = "h-9 w-auto" }: { className?: string }) {
  return (
    <img src="/brand/mark.svg" alt="Measured Health" className={className} />
  );
}

/** BHAI is a text placeholder until the official logo arrives (spec §3, Partner). */
export function PartnerLine() {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-3">
      <span>In partnership with</span>
      <b className="font-display text-lg font-black tracking-wide text-bloom">
        BHAI
      </b>
      <span aria-hidden className="h-3.5 w-px bg-lilac-2" />
      <span>University of Chicago</span>
    </p>
  );
}
