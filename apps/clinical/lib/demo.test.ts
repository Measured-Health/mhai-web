import { afterEach, describe, expect, it, vi } from "vitest";
import { isDemoBuild, isLiveDemoBuild, isMockBuild } from "./demo";

afterEach(() => vi.unstubAllEnvs());

const flags = (mock: string, demo: string) => {
  vi.stubEnv("NEXT_PUBLIC_USE_MOCK", mock);
  vi.stubEnv("NEXT_PUBLIC_DEMO", demo);
  return [isMockBuild(), isLiveDemoBuild(), isDemoBuild()];
};

describe("demo flags", () => {
  it("mock demo", () => expect(flags("true", "")).toEqual([true, false, true]));
  it("mock wins over the live demo flag", () =>
    expect(flags("true", "true")).toEqual([true, false, true]));
  it("live demo", () =>
    expect(flags("false", "true")).toEqual([false, true, true]));
  it("production: neither", () =>
    expect(flags("false", "")).toEqual([false, false, false]));
  it("only the exact value true counts", () =>
    expect(flags("false", "TRUE")).toEqual([false, false, false]));
});
