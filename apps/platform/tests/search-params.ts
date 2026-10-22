// A small stand-in for next/navigation whose search params really change on
// router.replace, so a test can watch the filters sit in the URL.
import { useSyncExternalStore } from "react";

let search = "";
const listeners = new Set<() => void>();
export const url = {
  get search() {
    return search;
  },
  set(next: string) {
    search = next;
    listeners.forEach((l) => l());
  },
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function useSearchParams() {
  const s = useSyncExternalStore(
    subscribe,
    () => search,
    () => search,
  );
  return new URLSearchParams(s);
}
export const router = {
  push: (to: string) => url.set(to.split("?")[1] ?? ""),
  replace: (to: string) => url.set(to.split("?")[1] ?? ""),
};
