import type { ClinicalResultOut } from "./api/contract";
import {
  RESULT_LABEL,
  sourceStatus,
  type ResultKind,
  type SourceStatus,
} from "./labels";

export type { ResultKind };

export interface ResultView {
  kind: ResultKind;
  title: string;
  icd10: string | null;
  body: string;
  confidence: { label: string; bars: 1 | 2 | 3 | 4 | 5 } | null;
  banner: { tone: "warn" | "bad"; title: string } | null;
  reducedAccuracy: boolean;
  claims: { verified: number; total: number };
  measures: { label: string; value: number }[]; // 0–1, only those the API returned
  sources: {
    title: string;
    status: SourceStatus;
    uses: number;
    excerpt: string;
  }[];
  seconds: string;
}

function barsFor(score: number | null, kind: ResultKind): 1 | 2 | 3 | 4 | 5 {
  if (kind === "high") return score !== null && score >= 0.85 ? 5 : 4;
  return score !== null && score >= 0.42 ? 3 : 2;
}

export function toResultView(r: ClinicalResultOut): ResultView {
  // Safety rule: degraded or escalated → needs review, never a confidence level.
  const kind: ResultKind =
    r.degraded || r.decision === "ESCALATE"
      ? "review"
      : r.decision === "REGENERATE"
        ? "caution"
        : "high";

  const banner: ResultView["banner"] =
    kind === "review"
      ? {
          tone: "bad",
          title:
            "This result needs clinician review before any clinical action is taken",
        }
      : kind === "caution"
        ? { tone: "warn", title: "Use with caution" }
        : null;

  const verified = r.citations.filter((c) => c.action === "PASS").length;

  const measures: ResultView["measures"] = [
    { label: "Evidence match", value: r.guardrail_details.l3_nli.pass_rate },
  ];
  if (r.guardrail_details.l2_entropy) {
    measures.push({
      label: "Answer stability",
      value: r.guardrail_details.l2_entropy.stability,
    });
  }

  const byTitle = new Map<string, ResultView["sources"][number]>();
  for (const c of r.citations) {
    const status = sourceStatus(c.action);
    const seen = byTitle.get(c.source_title);
    if (seen) seen.uses += 1;
    else
      byTitle.set(c.source_title, {
        title: c.source_title,
        status,
        uses: 1,
        excerpt: c.excerpt,
      });
  }

  return {
    kind,
    title: r.diagnosis ?? "Clinical assessment",
    icd10: r.icd10_code,
    body: r.response_text,
    confidence:
      kind === "review"
        ? null
        : { label: RESULT_LABEL[kind], bars: barsFor(r.trust_score, kind) },
    banner,
    reducedAccuracy: !r.guardrail_details.l3_nli.model_loaded,
    claims: { verified, total: r.citations.length },
    measures,
    sources: [...byTitle.values()],
    seconds: ((r.retrieval_ms + r.generation_ms) / 1000).toFixed(1),
  };
}
