import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

afterEach(() => cleanup());

// npm run test:nats: the default requesters are the fake core, never a real
// connection (tests that need their own pass it in).
if (process.env.BACKEND_TRANSPORT === "nats") {
  const { __setNatsRequesterForTests } =
    await import("../src/server/nats/connection");
  const { fakeCore } = await import("../src/server/nats/fake-core");
  beforeEach(() => {
    __setNatsRequesterForTests("clinical", fakeCore("clinical"));
    __setNatsRequesterForTests("platform", fakeCore("platform"));
  });
}
