import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
  getPlatformClient,
} from "./client";
import type { PlatformClient } from "./contract";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetPlatformClientForTests();
});

describe("getPlatformClient", () => {
  it("keeps one client for the tab, so sample data survives sign-out", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "true");
    const a = getPlatformClient();
    expect(getPlatformClient()).toBe(a);
    __resetPlatformClientForTests();
    expect(getPlatformClient()).not.toBe(a);
  });

  it("can be replaced in tests", () => {
    const fake = { listTeam: vi.fn() } as unknown as PlatformClient;
    __setPlatformClientForTests(fake);
    expect(getPlatformClient()).toBe(fake);
  });

  it("is the live client outside mock mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_MOCK", "false");
    const fetchMock = vi.fn(async () => Response.json({ members: [] }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await getPlatformClient().listTeam();
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v1/platform/team",
        expect.objectContaining({ method: "GET" }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
