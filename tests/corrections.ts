import type { CorrectionOut } from "@/lib/api/contract";

/** "Now" for correction tests: 2026-10-16 12:00 UTC. */
export const T0 = Date.parse("2026-10-16T12:00:00.000Z");

/** A waiting correction from Dr. Okafor, 42 minutes before T0 (synthetic). */
export function makeCorrection(
  over: Partial<CorrectionOut> = {},
): CorrectionOut {
  return {
    id: "c1",
    query_id: "q1",
    status: "pending_review",
    corrected_diagnosis: "Dengue fever with warning signs: admit",
    reason: "Persistent vomiting is a warning sign.",
    submitted_by: {
      display_name: "Dr. Okafor",
      full_name: "Dr. Chidi Okafor",
      specialty: "Paediatrics",
      hospital: "Havana Hospital",
    },
    submitted_at: new Date(T0 - 42 * 60_000).toISOString(),
    original: {
      decision: "REGENERATE",
      degraded: false,
      diagnosis: "Dengue fever, likely",
      icd10_code: "A90",
      response_text:
        "Febrile illness with rash.\n- Admit if platelets fall below 100 × 10⁹/L",
      citations: [
        {
          source_title: "WHO Dengue Guidelines 2024",
          claim_text: "NS1 antigen test and full blood count",
          action: "PASS",
        },
        {
          source_title: "WHO Dengue Guidelines 2024",
          claim_text: "Admit if platelets fall below 100 × 10⁹/L",
          action: "FLAG",
        },
      ],
    },
    consultation: {
      age: 24,
      sex: "female",
      symptoms: ["Fever", "Rash"],
      clinical_question: "Fever 3 days and rash, dengue area. Admit?",
      urgency: "urgent",
      specialty: "Infectious disease",
    },
    decided_by: null,
    decided_at: null,
    rejection: null,
    ...over,
  };
}
