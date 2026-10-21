import { ApiError } from "@mhai/api-client/errors";
import type { AlertHandledOut } from "./alerts-contract";

export { ApiError };

/** 409 `already_handled`: someone else acknowledged or dismissed the alert first (R7). */
export class AlertHandledError extends ApiError {
  constructor(readonly handled: AlertHandledOut) {
    super(409, "already_handled");
    this.name = "AlertHandledError";
  }
}

export const isAlertHandled = (e: unknown): e is AlertHandledError =>
  e instanceof AlertHandledError;
