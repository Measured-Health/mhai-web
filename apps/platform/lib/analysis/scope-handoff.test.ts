import { describe, expect, it } from "vitest";
import { handOffHospital, takeHandedOffHospital } from "./scope-handoff";

describe("the hospital hand-off", () => {
  it("is taken once, then gone", () => {
    expect(takeHandedOffHospital()).toBeNull();
    handOffHospital("h_pilot");
    expect(takeHandedOffHospital()).toBe("h_pilot");
    expect(takeHandedOffHospital()).toBeNull();
  });

  it("the last hand-off wins", () => {
    handOffHospital("h_pilot");
    handOffHospital("h_northgate");
    expect(takeHandedOffHospital()).toBe("h_northgate");
  });

  it("an id that isn't opaque is never handed on", () => {
    handOffHospital("h pilot/../x");
    expect(takeHandedOffHospital()).toBeNull();
  });
});
