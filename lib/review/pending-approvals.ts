/**
 * Approvals not yet settled (in their undo window, being sent or waiting to
 * retry), so signing out can send them first, while the session still works.
 * Each flush goes through the hook's own state, so an approval is still sent
 * only once.
 *
 * Every send belongs to the session that started it: `endApprovalSession`
 * (every sign-in and sign-out) moves to a new generation and cancels any
 * retry, so nothing is sent without that session or under someone else's.
 */
type Entry = { flush(): Promise<void>; cancel?(): void };
const entries = new Set<Entry>();
let generation = 0;

/** Adds an entry; returns the function that removes it. */
export function registerPendingFlush(
  flush: () => Promise<void>,
  cancel?: () => void,
): () => void {
  const e: Entry = { flush, cancel };
  entries.add(e);
  return () => void entries.delete(e);
}

/** Sends every waiting approval; never waits more than `timeoutMs`. */
export async function flushPendingApprovals(timeoutMs = 5_000): Promise<void> {
  if (!entries.size) return;
  const all = Promise.allSettled([...entries].map((e) => e.flush()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((r) => (timer = setTimeout(r, timeoutMs)));
  await Promise.race([all, late]);
  clearTimeout(timer);
}

/** The session sends belong to; it changes on every sign-in and sign-out. */
export const approvalSession = () => generation;

/** A sign-in or sign-out: a new generation, and every retry is cancelled. */
export function endApprovalSession(): void {
  generation += 1;
  for (const e of [...entries]) e.cancel?.();
}
