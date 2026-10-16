/**
 * Approvals waiting in their undo window, so signing out can send them
 * first, while the session still works. Each flush goes through the hook's
 * own window, so an approval is still sent only once.
 */
const flushers = new Set<() => Promise<void>>();

/** Adds a flush; returns the function that removes it. */
export function registerPendingFlush(fn: () => Promise<void>): () => void {
  flushers.add(fn);
  return () => void flushers.delete(fn);
}

/** Sends every waiting approval; never waits more than `timeoutMs`. */
export async function flushPendingApprovals(timeoutMs = 5_000): Promise<void> {
  if (!flushers.size) return;
  const all = Promise.allSettled([...flushers].map((f) => f()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<void>((r) => (timer = setTimeout(r, timeoutMs)));
  await Promise.race([all, late]);
  clearTimeout(timer);
}
