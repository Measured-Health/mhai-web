export function EcgLine() {
  // The 2.2 s loop is exempt from the motion-token rule: it is a continuous
  // loop, not a transition (spec S:115). It stops under reduced motion.
  return (
    <svg
      aria-hidden
      viewBox="0 0 300 70"
      className="mx-auto h-[70px] w-full max-w-[300px]"
    >
      <path
        d="M0 35h70l10-20 14 40 12-52 14 60 10-28h170"
        className="fill-none stroke-mint-2 opacity-20 blur-[3px] [stroke-width:8]"
      />
      <path
        d="M0 35h70l10-20 14 40 12-52 14 60 10-28h170"
        className="fill-none stroke-mint [stroke-dasharray:420] [stroke-linecap:round] [stroke-width:2.6] motion-safe:animate-[ecg_2.2s_linear_infinite]"
      />
    </svg>
  );
}
