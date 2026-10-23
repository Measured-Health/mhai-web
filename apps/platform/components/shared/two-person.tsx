"use client";
import type { ReactNode } from "react";
import type { TwoPersonRequest } from "@/lib/api/contract";
import { dayMonthLabel } from "@/lib/format";
import { Button } from "@mhai/ui/button";

/** What the requester sees: someone else must approve their request. */
export const WAITING = "Waiting for a different platform admin to approve";

export type TwoPersonActionsProps = {
  request: TwoPersonRequest;
  /**
   * The request in words, in place of "Requested by {name} · {date} ·
   * lapses {date}" (e.g. one that also says what was asked for).
   */
  line?: ReactNode;
  /** False for an auditor: the request line only, no buttons. */
  canAct: boolean;
  /** The approve button's words, e.g. "Approve lift". */
  approveLabel: string;
  /** Opens the caller's step-up dialog. */
  onApprove(): void;
  /** Either platform admin may cancel, with no step-up. */
  onCancel(): void;
  busy: boolean;
  /** `useNeedsConnection().props`, spread on both buttons when offline. */
  offlineProps?: {
    disabled?: boolean;
    title?: string;
    "aria-describedby"?: string;
  };
};

/**
 * A two-person request's line and its actions. Who may approve is the
 * server's `requested_by_you`, never a comparison of names.
 */
export function TwoPersonActions({
  request,
  line: words,
  canAct,
  approveLabel,
  onApprove,
  onCancel,
  busy,
  offlineProps = {},
}: TwoPersonActionsProps) {
  const line = (
    <p className="text-[13.5px] text-ink-2 [overflow-wrap:anywhere]">
      {words ?? (
        <>
          Requested by {request.requested_by.name} ·{" "}
          {dayMonthLabel(request.requested_at)} · lapses{" "}
          {dayMonthLabel(request.expires_at)}
        </>
      )}
    </p>
  );
  if (!canAct) return line;
  const mine = request.requested_by_you;
  return (
    <div>
      {line}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {mine && <p className="text-[13.5px] text-ink-2">{WAITING}</p>}
        <div className="ml-auto flex flex-wrap gap-2">
          {!mine && (
            <Button
              size="sm"
              variant="primary"
              {...offlineProps}
              disabled={busy || !!offlineProps.disabled}
              onClick={onApprove}
            >
              {approveLabel}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            {...offlineProps}
            disabled={busy || !!offlineProps.disabled}
            onClick={onCancel}
          >
            Cancel request
          </Button>
        </div>
      </div>
    </div>
  );
}
