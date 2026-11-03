/**
 * Opens the NATS connection when the server starts (R10), on the Node
 * runtime only and only when BACKEND_TRANSPORT is nats. `next build` never
 * runs this; without it the connection opens on the first call.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.BACKEND_TRANSPORT === "nats"
  ) {
    const { natsRequester } =
      await import("@mhai/api-client/server/nats/connection");
    natsRequester("platform");
  }
}
