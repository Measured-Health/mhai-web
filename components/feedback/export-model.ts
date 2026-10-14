import type { ResultView } from "@/lib/result-view";
import { sourceStatus, type SourceStatus } from "@/lib/labels";
import type { parseBody } from "../result/parse-body";

export const REDACTED_STEP = "[removed by safety checks]";
export const DISCLAIMER =
  "Decision support only. Final clinical judgement rests with the treating clinician.";

export const SOURCE_STATUS_TEXT: Record<SourceStatus, string> = {
  verified: "verified",
  review: "needs review",
  removed: "removed",
};

export interface ExportModel {
  /** Same wording as the screen banner (review and caution results). */
  banner: { title: string; body: string } | null;
  title: string;
  icd10: string | null;
  /** Null for review results and when the API returned no score. */
  confidence: { label: string; bars: number } | null;
  summary: string;
  steps: { n: number; text: string; redacted: boolean; ref: number | null }[];
  sources: { n: number; title: string; status: SourceStatus }[];
  safety: { verified: number; total: number; consistentReasoning: boolean };
  disclaimer: string;
}

/** Single source of truth for the text export and the print sheet. */
export function toExportModel(
  view: ResultView,
  parsed: ReturnType<typeof parseBody>,
): ExportModel {
  const titles = view.sources.map((s) => s.title);
  return {
    banner: view.banner
      ? { title: view.banner.title, body: view.banner.body }
      : null,
    title: view.title,
    icd10: view.icd10,
    confidence: view.kind === "review" ? null : view.confidence,
    summary: parsed.summary,
    steps: parsed.steps.map((s, i) => {
      const redacted = s.citation
        ? sourceStatus(s.citation.action) === "removed"
        : false;
      const idx = s.citation ? titles.indexOf(s.citation.source_title) : -1;
      return {
        n: i + 1,
        text: redacted ? REDACTED_STEP : s.text,
        redacted,
        ref: !redacted && idx >= 0 ? idx + 1 : null,
      };
    }),
    sources: view.sources.map((s, i) => ({
      n: i + 1,
      title: s.title,
      status: s.status,
    })),
    safety: {
      verified: view.claims.verified,
      total: view.claims.total,
      consistentReasoning: view.stability !== null,
    },
    disclaimer: DISCLAIMER,
  };
}
