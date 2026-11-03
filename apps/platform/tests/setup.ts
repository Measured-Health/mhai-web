import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// Component tests run in mock mode unless a test stubs the flag itself.
process.env.NEXT_PUBLIC_USE_MOCK ??= "true";

// The BFF suites run on both transports (npm run test:nats): on nats, an
// in-memory fake of core's NATS adapter sits between the transport and the
// suites' stubbed fetch, so every assertion holds on both.
if (process.env.BACKEND_TRANSPORT === "nats") {
  const { __setNatsRequesterForTests } =
    await import("@mhai/api-client/server/nats/connection");
  const { fakeCore } = await import("@mhai/api-client/server/nats/fake-core");
  const { beforeEach } = await import("vitest");
  beforeEach(() =>
    __setNatsRequesterForTests("platform", fakeCore("platform")),
  );
}
