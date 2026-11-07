import { describe, expect, it } from "vitest";
import type { ClinicalResultOut, Citation } from "./api/contract";
import { FORBIDDEN_TERMS } from "./labels";
import { FIXTURES } from "./api/fixtures";
import {
  LOCAL_DRAFT,
  MASKED_NOTICE,
  resultKind,
  toResultView,
} from "./result-view";

const EVIDENCE_FAILED =
  "The evidence didn't support enough of this answer for the system to stand behind it.";
const REDUCED_MODE =
  "Checks ran in a reduced mode, so this answer needs clinician review before use.";

const cite = (
  action: Citation["action"],
  title = "AHA 2021 Chest Pain",
): Citation => ({
  chunk_id: `c-${action}-${title}`,
  source_title: title,
  excerpt: "…",
  claim_text: "claim",
  nli_label: "ENTAILMENT",
  nli_confidence: 0.9,
  action,
  reason: "",
});

const base = (o: Partial<ClinicalResultOut> = {}): ClinicalResultOut => ({
  query_id: "q1",
  decision: "PASS",
  verified: true,
  degraded: false,
  failed_agents: [],
  response_available: true,
  diagnosis: "Unstable angina",
  icd10_code: "I20.0",
  response_text: "Summary.",
  trust_score: 0.82,
  trust_band: "high",
  citations: [cite("PASS")],
  cited_chunk_ids: ["c-PASS-AHA 2021 Chest Pain"],
  guardrail_details: {
    l1_persona: null,
    l2_entropy: null,
    l3_nli: { pass_rate: 0.92, claims_checked: 4, model_loaded: true },
    l4_trust: { trust_score: 0.82, base_trust: 0.9, flag_penalty: 0.08 },
    cascade_pass: true,
  },
  retrieval_ms: 2100,
  generation_ms: 9700,
  ...o,
});

describe("toResultView", () => {
  it("maps PASS to high confidence with 4 bars", () => {
    const v = toResultView(base());
    expect(v.kind).toBe("high");
    expect(v.confidence).toEqual({ label: "High confidence", bars: 4 });
    expect(v.banner).toBeNull();
  });

  it("gives 5 bars to a very high trust score", () => {
    expect(toResultView(base({ trust_score: 0.9 })).confidence?.bars).toBe(5);
  });

  it("maps REGENERATE to use with caution with an amber banner", () => {
    const v = toResultView(base({ decision: "REGENERATE", trust_score: 0.42 }));
    expect(v.kind).toBe("caution");
    expect(v.confidence).toEqual({ label: "Use with caution", bars: 3 });
    expect(v.banner?.tone).toBe("warn");
  });

  it("maps ESCALATE to needs review: red banner, no confidence", () => {
    const v = toResultView(base({ decision: "ESCALATE", trust_score: 0.2 }));
    expect(v.kind).toBe("review");
    expect(v.confidence).toBeNull();
    expect(v.banner).toEqual({
      tone: "bad",
      title:
        "This result needs clinician review before any clinical action is taken",
      body: EVIDENCE_FAILED,
    });
  });

  it("degraded PASS: neutral review copy that doesn't claim the evidence failed", () => {
    const v = toResultView(base({ degraded: true }));
    expect(v.banner?.tone).toBe("bad");
    expect(v.banner?.body).toBe(REDUCED_MODE);
    expect(v.banner?.body).not.toMatch(/evidence/i);
  });

  it("degraded REGENERATE: needs review (not caution), no confidence, neutral copy", () => {
    const v = toResultView(
      base({ decision: "REGENERATE", degraded: true, trust_score: 0.42 }),
    );
    expect(v.kind).toBe("review");
    expect(v.confidence).toBeNull();
    expect(v.banner?.tone).toBe("bad");
    expect(v.banner?.body).toBe(REDUCED_MODE);
  });

  it("ESCALATE + degraded: needs review, no confidence, evidence-failure copy", () => {
    const v = toResultView(
      base({ decision: "ESCALATE", degraded: true, trust_score: 0.9 }),
    );
    expect(v.kind).toBe("review");
    expect(v.confidence).toBeNull();
    expect(v.banner?.body).toBe(EVIDENCE_FAILED);
  });

  it("caution copy counts the unmatched recommendations", () => {
    const one = toResultView(
      base({ decision: "REGENERATE", citations: [cite("PASS"), cite("FLAG")] }),
    );
    expect(one.banner?.body).toBe(
      "1 recommendation couldn't be matched to a guideline. Check before acting.",
    );
    const none = toResultView(base({ decision: "REGENERATE" }));
    expect(none.banner?.body).toBe(
      "Check this answer against your own judgement before acting.",
    );
  });

  it("treats a degraded PASS as needs review (safety rule)", () => {
    const v = toResultView(base({ degraded: true, trust_score: null }));
    expect(v.kind).toBe("review");
    expect(v.confidence).toBeNull();
  });

  it("adds the reduced-accuracy notice when the evidence model is not loaded", () => {
    const r = base();
    r.guardrail_details.l3_nli.model_loaded = false;
    expect(toResultView(r).reducedAccuracy).toBe(true);
  });

  it("hides the ICD-10 chip and diagnosis when missing", () => {
    const v = toResultView(base({ icd10_code: null, diagnosis: null }));
    expect(v.icd10).toBeNull();
    expect(v.title).toBe("Clinical assessment");
  });

  it("exposes answer stability only when the API returned it", () => {
    expect(toResultView(base()).stability).toBeNull();
    const withStability = base();
    withStability.guardrail_details.l2_entropy = { stability: 0.61 };
    expect(toResultView(withStability).stability).toBe(0.61);
  });

  it("only returns confidence bars the API provided", () => {
    const v = toResultView(base());
    expect(v.measures.map((m) => m.label)).toEqual(["Evidence match"]);
    const withStability = base();
    withStability.guardrail_details.l2_entropy = { stability: 0.61 };
    expect(toResultView(withStability).measures.map((m) => m.label)).toEqual([
      "Evidence match",
      "Answer stability",
    ]);
  });

  it("counts verified claims and groups sources with use counts", () => {
    const v = toResultView(
      base({
        citations: [
          cite("PASS"),
          cite("PASS"),
          cite("FLAG", "WHO Dengue 2024"),
          cite("REDACT", "BNF"),
        ],
      }),
    );
    expect(v.claims).toEqual({ verified: 2, total: 4 });
    expect(v.sources).toEqual([
      {
        title: "AHA 2021 Chest Pain",
        status: "verified",
        uses: 2,
        excerpt: "…",
      },
      { title: "WHO Dengue 2024", status: "review", uses: 1, excerpt: "…" },
      { title: "BNF", status: "removed", uses: 1, excerpt: "…" },
    ]);
  });

  it("copes with no citations and empty text", () => {
    const v = toResultView(base({ citations: [], response_text: "" }));
    expect(v.claims).toEqual({ verified: 0, total: 0 });
    expect(v.sources).toEqual([]);
    expect(v.body).toBe("");
  });

  it("reports total time in seconds with one decimal", () => {
    expect(toResultView(base()).seconds).toBe("11.8");
  });

  it("lets the worst status win when a source backs several claims", () => {
    const v = toResultView(
      base({ citations: [cite("PASS", "BNF"), cite("REDACT", "BNF")] }),
    );
    expect(v.sources).toHaveLength(1);
    expect(v.sources[0]).toMatchObject({ status: "removed", uses: 2 });
    const w = toResultView(
      base({
        citations: [cite("REDACT", "X"), cite("PASS", "X"), cite("FLAG", "X")],
      }),
    );
    expect(w.sources[0].status).toBe("removed");
  });

  it("shows no confidence when trust is missing, keeping the kind", () => {
    const pass = toResultView(base({ trust_score: null }));
    expect(pass.kind).toBe("high");
    expect(pass.confidence).toBeNull();
    const regen = toResultView(
      base({ decision: "REGENERATE", trust_score: null }),
    );
    expect(regen.kind).toBe("caution");
    expect(regen.confidence).toBeNull();
  });

  it("omits Evidence match when the model is not loaded or nothing was checked", () => {
    const off = base();
    off.guardrail_details.l3_nli.model_loaded = false;
    expect(toResultView(off).measures).toEqual([]);
    const none = base();
    none.guardrail_details.l3_nli.claims_checked = 0;
    expect(toResultView(none).measures).toEqual([]);
  });

  it("never shows forbidden terms in any user-visible string", () => {
    const withStab = base({ diagnosis: null });
    withStab.guardrail_details.l2_entropy = { stability: 0.5 };
    const views = [
      withStab,
      base({ decision: "REGENERATE" }),
      base({ decision: "ESCALATE" }),
      base({ degraded: true }),
    ].map(toResultView);
    const shown = views
      .flatMap((v) => [
        v.title,
        v.banner?.title ?? "",
        v.banner?.body ?? "",
        v.confidence?.label ?? "",
        ...v.measures.map((m) => m.label),
      ])
      .join(" ")
      .toLowerCase();
    for (const term of FORBIDDEN_TERMS)
      expect(shown).not.toContain(term.toLowerCase());
  });
});

describe("resultKind", () => {
  it("puts degraded or escalated first, then maps the decision", () => {
    expect(resultKind({ decision: "PASS", degraded: false })).toBe("high");
    expect(resultKind({ decision: "REGENERATE", degraded: false })).toBe(
      "caution",
    );
    expect(resultKind({ decision: "ESCALATE", degraded: false })).toBe(
      "review",
    );
    expect(resultKind({ decision: "PASS", degraded: true })).toBe("review");
    expect(resultKind({ decision: "REGENERATE", degraded: true })).toBe(
      "review",
    );
  });
});

describe("contract v1.2.0", () => {
  it("cited, details not stored: kind and banner rules hold, sources are flagged as not shown", async () => {
    const { CITED_NOT_STORED } = await import("./api/fixtures");
    const v = toResultView(CITED_NOT_STORED);
    expect(v.kind).toBe("high");
    expect(v.banner).toBeNull();
    expect(v.sources).toEqual([]);
    expect(v.claims).toEqual({ verified: 0, total: 0 });
    expect(v.detailsNotStored).toBe(true);
    expect(toResultView(base()).detailsNotStored).toBe(false);
    expect(
      toResultView(base({ citations: [], cited_chunk_ids: [] }))
        .detailsNotStored,
    ).toBe(false);
  });
  it("confidence comes from trust_score, never trust_band (R12)", () => {
    for (const band of ["low", "mid", "high", null] as const) {
      const v = toResultView(base({ trust_score: 0.9, trust_band: band }));
      expect(v.confidence?.bars).toBe(5);
    }
    expect(
      toResultView(base({ trust_score: null, trust_band: "high" })).confidence,
    ).toBeNull();
  });
  it("needs review never shows a confidence level, whatever trust_band says", () => {
    for (const r of [
      base({ decision: "ESCALATE", trust_band: "high" }),
      base({ degraded: true, trust_band: "high" }),
    ]) {
      const v = toResultView(r);
      expect(v.kind).toBe("review");
      expect(v.confidence).toBeNull();
    }
  });
  it("trust_band appears nowhere in the view model", () => {
    const v = toResultView(base({ trust_band: "mid" }));
    expect(JSON.stringify(v)).not.toMatch(/trust_band|"mid"/);
    expect(Object.keys(v)).not.toContain("trustBand");
  });
});

describe("who drafted the answer (generated_by, core 1.10.0)", () => {
  const view = (g: unknown) =>
    toResultView({
      ...FIXTURES.high,
      generated_by: g as ClinicalResultOut["generated_by"],
    }).generatedBy;

  it("names the cloud provider, with the masking notice", () => {
    expect(view({ route: "cloud", provider: "anthropic" })).toEqual({
      label: "Drafted by Anthropic (cloud AI)",
      notice: MASKED_NOTICE,
    });
    expect(view({ route: "cloud", provider: "openai" })?.label).toBe(
      "Drafted by OpenAI (cloud AI)",
    );
    expect(view({ route: "cloud", provider: "xai" })?.label).toBe(
      "Drafted by xAI (cloud AI)",
    );
  });

  it("says local only when the reply says local, with no notice", () => {
    expect(view({ route: "local", provider: null })).toEqual({
      label: LOCAL_DRAFT,
      notice: null,
    });
    expect(view({ route: "local", provider: "anthropic" })).toBeNull();
  });

  it("a cloud route with a provider it doesn't know still says cloud", () => {
    for (const provider of ["someone-new", null, 7, "toString"])
      expect(view({ route: "cloud", provider })).toEqual({
        label: "Drafted by a cloud AI model",
        notice: MASKED_NOTICE,
      });
  });

  it("the notice claims only what the masker does", () => {
    expect(MASKED_NOTICE).toBe(
      "Identifying patient details were masked where detected before the question was sent.",
    );
  });

  it("shows nothing when it's absent or malformed", () => {
    for (const g of [undefined, null, "cloud", {}, { route: "edge" }])
      expect(view(g)).toBeNull();
  });

  it("no backend term reaches the words", () => {
    const shown = [
      LOCAL_DRAFT,
      MASKED_NOTICE,
      view({ route: "cloud", provider: "anthropic" })!.label,
    ]
      .join(" ")
      .toLowerCase();
    for (const term of FORBIDDEN_TERMS)
      expect(shown).not.toContain(term.toLowerCase());
    expect(shown).not.toMatch(/generated_by|route|provider/);
  });
});
