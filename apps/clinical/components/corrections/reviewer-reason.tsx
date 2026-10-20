/** The reviewer's reason for a rejection, shown under the correction. */
export function ReviewerReason({ reason }: { reason: string }) {
  return (
    <p className="mt-1.5 rounded-xl bg-bad-wash px-3 py-2 text-[13px] text-bad-deep [overflow-wrap:anywhere]">
      <span className="font-semibold">Reviewer&apos;s reason: </span>“{reason}”
    </p>
  );
}
