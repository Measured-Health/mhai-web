import type { PatientsClient } from "./patients-contract";
import { createLivePatients } from "./live-patients";
import { createMockPatients } from "./mock-patients";

export type { PatientsClient };

let client: PatientsClient | undefined;

/** Sample patients when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getPatientsClient(): PatientsClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockPatients()
      : createLivePatients());
}

/** Forgets the client (and the demo's sample patients) at sign-out. */
export function resetPatientsClient(): void {
  client = undefined;
}
