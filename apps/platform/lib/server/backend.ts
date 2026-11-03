import "server-only";
import { isIP } from "node:net";
import { headers } from "next/headers";
import {
  backendReady as ready,
  backendTransport,
  createBackendFetch,
} from "@mhai/api-client/server/backend-fetch";

export { NATS_API_ORIGIN } from "@mhai/api-client/server/backend-fetch";

/**
 * The end user's IP (R3), from the one header the host's nginx overwrites,
 * named by TRUSTED_CLIENT_IP_HEADER (the demo's sites set X-Real-IP). Only
 * an IP literal is sent; unset or invalid, none is, and core refuses a
 * sign-in (fail closed).
 */
export async function clientIp(): Promise<string | undefined> {
  const name = process.env.TRUSTED_CLIENT_IP_HEADER;
  if (!name) return undefined;
  try {
    const v = (await headers()).get(name)?.trim();
    return v && isIP(v) ? v : undefined;
  } catch {
    return undefined; // outside a request (or a test's next/headers mock without headers)
  }
}

/** This app's way to core: fetch or NATS, by BACKEND_TRANSPORT. */
export const backendFetch = createBackendFetch({ app: "platform", clientIp });

export const backendReady = () => ready("platform");

export const onNats = () => backendTransport() === "nats";
