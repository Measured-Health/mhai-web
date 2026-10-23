import type { EmrClient } from "./emr-contract";
import { createLiveEmr } from "./live-emr";
import { createMockEmr } from "./mock-emr";

export type { EmrClient };

let client: EmrClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getEmrClient(): EmrClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockEmr()
      : createLiveEmr());
}

/**
 * Forgets the client at sign-out, so the next person starts afresh: the
 * demo's sample settings are back as they began. The live client holds
 * nothing, so a new one changes nothing there.
 */
export function resetEmrClient(): void {
  client = undefined;
}
