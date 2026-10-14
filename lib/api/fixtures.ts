import type { Citation, ClinicalResultOut } from "./contract";

const c = (
  title: string,
  claim: string,
  excerpt: string,
  action: Citation["action"] = "PASS",
): Citation => ({
  chunk_id: `${title}-${claim}`.slice(0, 40),
  source_title: title,
  excerpt,
  claim_text: claim,
  nli_label:
    action === "PASS"
      ? "ENTAILMENT"
      : action === "FLAG"
        ? "NEUTRAL"
        : "CONTRADICTION",
  nli_confidence: action === "PASS" ? 0.93 : 0.4,
  action,
  reason: "",
});

const gd = (
  pass: number,
  n: number,
  loaded = true,
): ClinicalResultOut["guardrail_details"] => ({
  l1_persona: null,
  l2_entropy: null,
  l3_nli: { pass_rate: pass, claims_checked: n, model_loaded: loaded },
  l4_trust: { trust_score: pass, base_trust: pass, flag_penalty: 0 },
  cascade_pass: pass > 0.5,
});

/** Three result fixtures; "failed" is a query status (see mock.ts), not a result. */
export const FIXTURES: Record<
  "high" | "caution" | "review",
  ClinicalResultOut
> = {
  high: {
    query_id: "",
    decision: "PASS",
    verified: true,
    degraded: false,
    failed_agents: [],
    response_available: true,
    diagnosis: "Unstable angina",
    icd10_code: "I20.0",
    response_text:
      "Presentation is consistent with acute coronary syndrome in a high-risk patient (smoker, type 2 diabetes).\n- 12-lead ECG within 10 minutes of arrival [1]\n- Serial high-sensitivity troponin at 0 and 3 hours [2]\n- Aspirin 300 mg chewed, unless contraindicated [3]\n- Risk-stratify with HEART score before disposition [4]",
    trust_score: 0.82,
    citations: [
      c(
        "AHA 2021 Chest Pain Guideline",
        "12-lead ECG within 10 minutes of arrival",
        "Obtain a 12-lead ECG within 10 minutes of arrival…",
      ),
      c(
        "ESC 2023 ACS Guideline",
        "Serial high-sensitivity troponin at 0 and 3 hours",
        "Serial hs-cTn at 0h/3h…",
      ),
      c(
        "AHA 2021 Chest Pain Guideline",
        "Aspirin 300 mg chewed, unless contraindicated",
        "Aspirin 162–325 mg chewed…",
      ),
      c(
        "NICE CG95",
        "Risk-stratify with HEART score before disposition",
        "Use a validated risk score…",
      ),
    ],
    guardrail_details: gd(0.92, 4),
    retrieval_ms: 2100,
    generation_ms: 9700,
  },
  caution: {
    query_id: "",
    decision: "REGENERATE",
    verified: false,
    degraded: false,
    failed_agents: [],
    response_available: true,
    diagnosis: "Dengue fever, likely",
    icd10_code: "A90",
    response_text:
      "Febrile illness with rash in an endemic area.\n- NS1 antigen test and full blood count [1]\n- Oral fluids, paracetamol for fever; avoid NSAIDs [2]\n- Admit if platelets fall below 100 × 10⁹/L [3]",
    trust_score: 0.42,
    citations: [
      c(
        "WHO Dengue Guidelines 2024",
        "NS1 antigen test and full blood count",
        "NS1 antigen detection in the first 5 days…",
      ),
      c(
        "WHO Dengue Guidelines 2024",
        "Oral fluids, paracetamol for fever; avoid NSAIDs",
        "Avoid NSAIDs; use paracetamol for fever…",
      ),
      c(
        "Unmatched claim",
        "Admit if platelets fall below 100 × 10⁹/L",
        "",
        "FLAG",
      ),
    ],
    guardrail_details: gd(0.66, 3),
    retrieval_ms: 2400,
    generation_ms: 10100,
  },
  review: {
    query_id: "",
    decision: "ESCALATE",
    verified: false,
    degraded: false,
    failed_agents: [],
    response_available: true,
    diagnosis: "Hypokalaemia, cause unclear",
    icd10_code: "E87.6",
    response_text:
      "Serum K⁺ 2.9 mmol/L. Several suggested causes and replacement doses could not be verified.\n- Check magnesium and renal function [1]\n- IV potassium 40 mmol over 1 hour via peripheral line [2]",
    trust_score: 0.21,
    citations: [
      c(
        "BNF: Potassium chloride",
        "Check magnesium and renal function",
        "Correct hypomagnesaemia…",
        "FLAG",
      ),
      c(
        "BNF: Potassium chloride",
        "IV potassium 40 mmol over 1 hour via peripheral line",
        "",
        "REDACT",
      ),
    ],
    guardrail_details: gd(0.25, 4, false),
    retrieval_ms: 2600,
    generation_ms: 11600,
  },
};
