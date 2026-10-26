import { describe, expect, it } from "vitest";
import { handOffHospital, takeHandedOffHospital } from "./scope-handoff";

describe("the hospital hand-off", () => {
  it("is taken once, then gone", () => {
    expect(takeHandedOffHospital()).toBeNull();
    handOffHospital("h_havana");
    expect(takeHandedOffHospital()).toBe("h_havana");
    expect(takeHandedOffHospital()).toBeNull();
  });

  it("the last hand-off wins", () => {
    handOffHospital("h_havana");
    handOffHospital("h_northgate");
    expect(takeHandedOffHospital()).toBe("h_northgate");
  });

  it("an id that isn't opaque is never handed on", () => {
    handOffHospital("h havana/../x");
    expect(takeHandedOffHospital()).toBeNull();
  });
});
