import type { AlertOut } from "@/lib/api/alerts-contract";
import { createMockAlerts, type MockAlerts } from "@/lib/api/mock-alerts";

/** "Now" in alert tests: 17 Oct 2026, 09:00 local time, so clock times read the same in any zone. */
export const ALERT_NOW = new Date(2026, 9, 17, 9, 0, 0).getTime();

/** An ISO time on the test day, at a local hour and minute. */
export const at = (h: number, m: number) =>
  new Date(2026, 9, 17, h, m).toISOString();

/** A new Critical alert for a synthetic patient on Ward 3. */
export function makeAlert(over: Partial<AlertOut> = {}): AlertOut {
  return {
    id: "al-test",
    severity: "critical",
    status: "new",
    finding: {
      name: "Potassium",
      value: "2.9",
      unit: "mmol/L",
      flag: "low",
      reference_range: "3.5–5.1",
      recorded_at: at(8, 42),
      code_system: "LOINC",
      standardised: true,
    },
    likely_causes: [
      { label: "Diuretic treatment", confidence: "high" },
      { label: "Vomiting or diarrhoea", confidence: "caution" },
      { label: "Low magnesium", confidence: "review" },
    ],
    patient: {
      full_name: "Maryam Abdullahi",
      mrn: "204817",
      location: { kind: "admitted", ward: "Ward 3", bed: "Bed 12" },
    },
    age: 67,
    sex: "female",
    source_label: "Main record",
    emr_link: "https://record.example/open/al-test",
    handled_by: null,
    handled_at: null,
    dismiss_reason: null,
    created_at: at(8, 44),
    ...over,
  };
}

/** The sample alerts on a fixed clock, no delay, acting as Dr. Reyes; no arrivals unless asked. */
export const mockAlerts = (
  o: { now?: () => number; arrivals?: boolean } = {},
): MockAlerts =>
  createMockAlerts({
    now: o.now ?? (() => ALERT_NOW),
    me: async () => "Dr. Reyes",
    delayMs: 0,
    arrivals: o.arrivals ?? false,
  });
