"use client";
import { Banner } from "@mhai/ui/banner";
import { Button } from "@mhai/ui/button";
import { isNotImplemented } from "@/lib/errors";
import { NotAvailable } from "./not-available";

/**
 * A read that failed, with Try again. Given the error, a 501
 * `not_implemented` (core doesn't do it yet) is the calm Not available yet
 * instead: nothing to retry.
 */
export function CouldntLoad({
  what,
  onRetry,
  error,
}: {
  what: string;
  onRetry(): void;
  error?: unknown;
}) {
  if (isNotImplemented(error)) return <NotAvailable what={what} />;
  return (
    <Banner tone="bad" title={`Couldn't load ${what}.`}>
      <p>Check your connection and try again.</p>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 min-h-11"
        onClick={onRetry}
      >
        Try again
      </Button>
    </Banner>
  );
}
