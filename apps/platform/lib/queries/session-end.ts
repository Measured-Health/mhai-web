import type { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@mhai/api-client/errors";
import { queryKeys } from "./keys";

/**
 * Bumped at every sign-out. A write that began in an earlier session checks
 * it, so nothing from the previous person lands in the next person's cache.
 */
let epoch = 0;

export const sessionEpoch = () => epoch;

/**
 * Thrown by a write that outlived the session it began in. A 4xx, so the
 * write is not retried.
 */
export class SessionEnded extends ApiError {
  constructor() {
    super(409, "session_ended");
  }
}

/** Module state that must not outlive the person (see `onSessionEnd`). */
const forgets = new Set<() => void>();

/** Registers what to forget at sign-out (a hand-off, ids already sent). */
export function onSessionEnd(forget: () => void): void {
  forgets.add(forget);
}

/**
 * Sign-out: cancel the notification, audit and analysis queries still in flight (the
 * background polls among them), forget the module state that belongs to the
 * person, and mark every write begun so far as belonging to a finished
 * session.
 */
export function endSessionRequests(qc: QueryClient) {
  epoch += 1;
  void qc.cancelQueries({ queryKey: queryKeys.notifications });
  void qc.cancelQueries({ queryKey: queryKeys.audit });
  void qc.cancelQueries({ queryKey: queryKeys.analysis });
  for (const forget of forgets) forget();
}
