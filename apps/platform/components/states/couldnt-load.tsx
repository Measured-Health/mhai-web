"use client";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";

export function CouldntLoad({
  what,
  onRetry,
}: {
  what: string;
  onRetry(): void;
}) {
  return (
    <Banner tone="bad" title={`Couldn't load ${what}.`}>
      <p>Check your connection and try again.</p>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
        Try again
      </Button>
    </Banner>
  );
}
