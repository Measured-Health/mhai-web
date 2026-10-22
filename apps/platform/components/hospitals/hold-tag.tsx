import { Scale } from "lucide-react";
import { Chip } from "@mhai/ui/chip";

/** A hospital with records under a legal hold: an icon and the word. */
export function HoldTag({ className }: { className?: string }) {
  return (
    <Chip tone="brand" className={className}>
      <Scale aria-hidden className="size-3.5" />
      Hold
    </Chip>
  );
}
