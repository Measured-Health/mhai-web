/**
 * The new backup code core issued after one was used to confirm an action,
 * held in memory only until the person has seen it and pressed Continue.
 * Never in browser storage, a URL, the query cache or a log. One slot: a
 * newer code replaces an older one (the older no longer works).
 *
 * The API helpers put a code here from a successful reply's header; the
 * app's NewBackupCodeHost shows it; a step-up action waits for it with
 * `whenBackupCodeSaved` before it finishes.
 */
type Listener = (code: string | null) => void;

let current: string | null = null;
const listeners = new Set<Listener>();
let waiting: (() => void)[] = [];

const tell = () => {
  for (const l of listeners) l(current);
};

/** Holds a new code to show. Browser only: a server never keeps one. */
export function offerNewBackupCode(code: string): void {
  if (typeof window === "undefined") return;
  current = code;
  tell();
}

/** The code waiting to be shown, or null. */
export const pendingBackupCode = (): string | null => current;

/** Forgets the code (Continue, or sign-out) and lets waiting actions finish. */
export function clearNewBackupCode(): void {
  current = null;
  const done = waiting;
  waiting = [];
  tell();
  for (const f of done) f();
}

/** Resolves once no new code is waiting to be seen (at once if none is). */
export function whenBackupCodeSaved(): Promise<void> {
  if (current === null) return Promise.resolve();
  return new Promise((resolve) => waiting.push(resolve));
}

/** Calls `l` with each change; returns the unsubscribe. */
export function onNewBackupCode(l: Listener): () => void {
  listeners.add(l);
  return () => void listeners.delete(l);
}
