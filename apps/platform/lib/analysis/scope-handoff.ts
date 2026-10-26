// The hospital a hospital page hands to Analysis ("Analysis for this
// hospital"). A module variable, taken once when the page mounts, so the
// hospital never goes in the URL, browser storage, the title or logs.
import { isId } from "@mhai/ui/guards";

let handed: string | null = null;

/** Sets the hospital the next Analysis page opens on (an opaque id only). */
export function handOffHospital(id: string): void {
  handed = isId(id) ? id : null;
}

/** The handed-off hospital, once: it is gone after this. */
export function takeHandedOffHospital(): string | null {
  const id = handed;
  handed = null;
  return id;
}

/** Drops any hand-off: on sign-out, so the next person never opens on it. */
export function clearHandedOffHospital(): void {
  handed = null;
}
