type Listener = () => void;
const listeners = new Set<Listener>();

/** Any live API call that finds the session gone reports it here. */
export function onUnauthorized(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function reportUnauthorized() {
  for (const fn of listeners) fn();
}
