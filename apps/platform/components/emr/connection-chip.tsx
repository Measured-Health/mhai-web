import type { ConnectionState } from "@/lib/api/emr-contract";
import { STATE_ICON, stateLabel } from "@/lib/emr/labels";
import { Chip } from "@mhai/ui/chip";

const TONE: Record<ConnectionState, "ok" | "warn" | "bad" | "muted"> = {
  connected: "ok",
  needs_attention: "bad",
  off: "muted",
  not_tested: "warn",
};

/** A connection's state as an icon and the word: never colour alone. */
export function ConnectionChip({ state }: { state: ConnectionState }) {
  const Icon = STATE_ICON[state];
  return (
    <Chip tone={TONE[state]}>
      <Icon aria-hidden className="size-3.5" />
      {stateLabel(state)}
    </Chip>
  );
}

/** The hospital with no connection: a word and an icon, like the others. */
export function NotConnectedChip() {
  const Icon = STATE_ICON.not_tested;
  return (
    <Chip tone="muted">
      <Icon aria-hidden className="size-3.5" />
      Not connected
    </Chip>
  );
}
