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

/**
 * Sign-out: cancel the notification queries still in flight and mark every
 * write begun so far as belonging to a finished session.
 */
export function endSessionRequests(qc: QueryClient) {
  epoch += 1;
  void qc.cancelQueries({ queryKey: queryKeys.notifications });
}
