import type { ReactNode } from "react";

/** A bar's note: the text and the action together; nothing when both are empty. */
export function noteOf(
  text: string | null,
  action: ReactNode,
): ReactNode | undefined {
  if (!text && !action) return undefined;
  if (!action) return text;
  if (!text) return action;
  return (
    <>
      {text} {action}
    </>
  );
}
