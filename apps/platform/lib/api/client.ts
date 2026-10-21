import type { PlatformClient } from "./contract";
import { createLivePlatformClient } from "./live";
import { createMockPlatform } from "./mock";

let client: PlatformClient | undefined;

/**
 * Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the
 * proxy. One client per tab: it outlives sign-out, so a second admin signing
 * in to the same tab sees the first one's changes (the two-admin demo).
 */
export function getPlatformClient(): PlatformClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockPlatform()
      : createLivePlatformClient());
}

export function __setPlatformClientForTests(c: PlatformClient) {
  client = c;
}

export function __resetPlatformClientForTests() {
  client = undefined;
}
