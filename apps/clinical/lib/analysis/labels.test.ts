import { describe, expect, it } from "vitest";
import { FEWER_THAN_5 } from "@mhai/ui/small-groups";
import {
  AGE_LABEL,
  SETTING_LABEL,
  SEX_LABEL,
  VIEWS,
  VIEW_TITLE,
  conditionText,
  countText,
  failedText,
  locationText,
  minutesText,
  shareText,
} from "./labels";

const S = (value: number) => ({ value, suppressed: false });
const H = { value: null, suppressed: true };

describe("analysis labels", () => {
  it("names the views in page order", () => {
    expect(VIEWS.map((v) => VIEW_TITLE[v])).toEqual([
      "Prevalence and trends",
      "Who is affected",
      "Co-occurring conditions",
      "Findings and alerts",
      "MHAI quality",
    ]);
  });

  it("says which view couldn't load", () => {
    expect(failedText("affected")).toBe("Couldn't load who is affected");
    expect(failedText("prevalence")).toBe(
      "Couldn't load prevalence and trends",
    );
    expect(failedText("quality")).toBe("Couldn't load MHAI quality");
  });

  it("Not standardised", () => {
    expect(conditionText({ id: "unmapped", name: null, icd10: null })).toBe(
      "Not standardised",
    );
    expect(conditionText({ id: "x", name: null, icd10: "Z99" })).toBe(
      "Not standardised",
    );
  });

  it("Type 2 diabetes · E11", () => {
    expect(
      conditionText({ id: "e11", name: "Type 2 diabetes", icd10: "E11" }),
    ).toBe("Type 2 diabetes · E11");
    expect(conditionText({ id: "x", name: "Asthma", icd10: null })).toBe(
      "Asthma",
    );
  });

  it("Location not recorded", () => {
    expect(locationText(null)).toBe("Location not recorded");
    expect(
      locationText({
        id: "ward4",
        label: "Ward 4 (Medical)",
        setting: "admitted",
      }),
    ).toBe("Ward 4 (Medical)");
  });

  it("80 and over", () => {
    expect(AGE_LABEL["80+"]).toBe("80 and over");
    expect(AGE_LABEL["0-17"]).toBe("0–17");
    expect(SEX_LABEL.not_recorded).toBe("Not recorded");
    expect(SETTING_LABEL.emergency).toBe("Emergency");
  });

  it("a hidden value reads Fewer than 5; 0 reads 0", () => {
    expect(countText(H)).toBe(FEWER_THAN_5);
    expect(shareText(H)).toBe(FEWER_THAN_5);
    expect(minutesText(H)).toBe(FEWER_THAN_5);
    expect(countText(S(0))).toBe("0");
    expect(countText(S(1204))).toBe("1,204");
    expect(shareText(S(0.4))).toBe("40%");
  });

  it("a median of 12.5 minutes reads 12.5 min", () => {
    expect(minutesText(S(12.5))).toBe("12.5 min");
    expect(minutesText(S(6))).toBe("6 min");
    expect(minutesText(S(90))).toBe("1.5 h");
  });
});
