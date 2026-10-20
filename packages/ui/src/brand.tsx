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

/** The BHAI logo; decorative wherever the name "BHAI" is written next to it. */
export function BhaiLogo({ className = "size-7" }: { className?: string }) {
  return (
    <img
      src="/brand/bhai-logo.png"
      alt=""
      aria-hidden
      className={`${className} rounded-md`}
    />
  );
}

/** Partner credit (spec §3, Partner): the BHAI logo and name. */
export function PartnerLine() {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-3">
      <span>In partnership with</span>
      <BhaiLogo />
      <b className="font-display text-lg font-black tracking-wide text-bloom">
        BHAI
      </b>
    </p>
  );
}
