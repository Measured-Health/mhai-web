import type { ConnectionState } from "@/lib/api/emr-contract";
import { STATE_ICON, stateLabel } from "@/lib/emr/labels";
import { Chip } from "@mhai/ui/chip";

const TONE = {
  connected: "ok",
  needs_attention: "bad",
  off: "muted",
  not_tested: "warn",
} as const;

/** A connection's state as an icon and the word: never colour alone. */
export function StateChip({ state }: { state: ConnectionState }) {
  const Icon = STATE_ICON[state];
  return (
    <Chip tone={TONE[state]}>
      <Icon aria-hidden className="size-3.5" />
      {stateLabel(state)}
    </Chip>
  );
}
