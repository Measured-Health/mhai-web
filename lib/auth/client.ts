import { createLiveAuthClient } from "./live";
import { createMockAuthClient } from "./mock";
import type { AuthClient } from "./types";

let client: AuthClient | undefined;

/** The demo's sign-in when NEXT_PUBLIC_USE_MOCK=true; otherwise the BFF. */
export function getAuthClient(): AuthClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAuthClient()
      : createLiveAuthClient());
}
