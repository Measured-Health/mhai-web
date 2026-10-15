import { createMockAuthClient } from "./mock";
import type { AuthClient } from "./types";

let client: AuthClient | undefined;

/** Task 1 ships mock mode only. Task 12 adds the live client behind the BFF. */
export function getAuthClient(): AuthClient {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") {
    throw new Error(
      "Live sign-in arrives in Task 12. Set NEXT_PUBLIC_USE_MOCK=true.",
    );
  }
  return (client ??= createMockAuthClient());
}
