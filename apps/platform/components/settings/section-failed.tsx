"use client";
import { Section } from "../hospitals/section";
import { CouldntLoad } from "../states/couldnt-load";

/** A settings section that couldn't be read, in its own card with Try again. */
export function SectionFailed({
  title,
  what,
  onRetry,
}: {
  title: string;
  what: string;
  onRetry(): void;
}) {
  return (
    <Section title={title}>
      <CouldntLoad what={what} onRetry={onRetry} />
    </Section>
  );
}
