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
  /** Screen banner; exports reuse the same title and body. */
  banner: { tone: "warn" | "bad"; title: string; body: string } | null;
  reducedAccuracy: boolean;
  claims: { verified: number; total: number };
  measures: { label: string; value: number }[]; // 0–1, only those the API returned
  stability: number | null; // 0–1 answer stability, null when the API didn't return it
  sources: {
    title: string;
    status: SourceStatus;
    uses: number;
    excerpt: string;
  }[];
  seconds: string;
  /**
   * The answer cites sources, but their details aren't stored yet
   * (contract v1.2.0): the evidence panel says they can't be shown, never
   * that none were used.
   */
  detailsNotStored: boolean;
  /**
   * Who drafted the answer, from `generated_by`, with the notice a cloud
   * draft carries; null when the API didn't say.
   */
  generatedBy: { label: string; notice: string | null } | null;
  /**
   * The cited reference sources (core 1.29.0): title, an https link or
   * null, who published it, and its credit notice. Empty when none.
   */
  references: {
    title: string;
    url: string | null;
    source: string;
    attribution: string | null;
  }[];
}

/** The only link shape shown: https, a host name, a plain path and query. */
const SOURCE_URL =
  /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[A-Za-z0-9._~%/?=&+-]*)?$/;
const MAX_REFERENCES = 50;

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() !== "" && v.length <= max ? v : null;

/**
 * Read defensively: an entry needs a title and a source; a link only when
 * it is an https page of the shape above (else no link); each chunk once.
 */
export function referencesView(s: unknown): ResultView["references"] {
  if (!Array.isArray(s)) return [];
  const out: ResultView["references"] = [];
  const seen = new Set<string>();
  for (const e of s.slice(0, MAX_REFERENCES)) {
    if (typeof e !== "object" || e === null) continue;
    const { chunk_id, title, url, source, attribution } = e as Record<
      string,
      unknown
    >;
    const t = text(title, 300);
    const src = text(source, 64);
    if (typeof chunk_id !== "string" || seen.has(chunk_id) || !t || !src)
      continue;
    seen.add(chunk_id);
    out.push({
      title: t,
      url:
        typeof url === "string" && url.length <= 500 && SOURCE_URL.test(url)
          ? url
          : null,
      source: src,
      attribution: text(attribution, 600),
    });
  }
  return out;
}

const PROVIDER_NAME: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  xai: "xAI",
  gemini: "Google Gemini",
};
/** A provider code's shape: a short lower-case word (core 1.16.0). */
const PROVIDER_CODE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const LOCAL_DRAFT = "Drafted by MHAI's own model";
export const MASKED_NOTICE =
  "Identifying patient details were masked where detected before the question was sent.";

/** A provider's name: the company's when known, else the code as it is. */
function providerName(v: unknown, asIs: boolean): string | null {
  if (typeof v !== "string") return null;
  if (Object.hasOwn(PROVIDER_NAME, v)) return PROVIDER_NAME[v]!;
  return asIs && PROVIDER_CODE.test(v) ? v : null;
}

/**
 * Read defensively: "local" only when the reply says local; any cloud
 * route says cloud, naming the provider from `provider_code` (core 1.16.0;
 * the only field that names Google Gemini, shown as it is when this app
 * doesn't know it), else from `provider` when it is one this app knows.
 * Anything else shows nothing (show only what the API returns).
 */
export function generatedByView(g: unknown): ResultView["generatedBy"] {
  if (typeof g !== "object" || g === null) return null;
  const { route, provider, provider_code } = g as {
    route?: unknown;
    provider?: unknown;
    provider_code?: unknown;
  };
  if (route === "local" && provider === null && provider_code == null)
    return { label: LOCAL_DRAFT, notice: null };
  if (route !== "cloud") return null;
  const name =
    providerName(provider_code, true) ?? providerName(provider, false);
  return {
    label: name
      ? `Drafted by ${name} (cloud AI)`
      : "Drafted by a cloud AI model",
    notice: MASKED_NOTICE,
  };
}

// Worst status wins when one source backs several claims.
const STATUS_RANK: Record<SourceStatus, number> = {
  verified: 0,
  review: 1,
  removed: 2,
};

function barsFor(score: number | null, kind: ResultKind): 1 | 2 | 3 | 4 | 5 {
  if (kind === "high") return score !== null && score >= 0.85 ? 5 : 4;
  return score !== null && score >= 0.42 ? 3 : 2;
}

/** Safety rule: degraded or escalated → needs review, never a confidence level. */
export function resultKind(
  r: Pick<ClinicalResultOut, "decision" | "degraded">,
): ResultKind {
  if (r.degraded || r.decision === "ESCALATE") return "review";
  return r.decision === "REGENERATE" ? "caution" : "high";
}

export function toResultView(r: ClinicalResultOut): ResultView {
  const kind = resultKind(r);

  const verified = r.citations.filter((c) => c.action === "PASS").length;
  const open = r.citations.length - verified;

  // Only ESCALATE says the evidence fell short. A degraded result needs review
  // because checks ran in a reduced mode; that says nothing about the evidence.
  const banner: ResultView["banner"] =
    kind === "review"
      ? {
          tone: "bad",
          title:
            "This result needs clinician review before any clinical action is taken",
          body:
            r.decision === "ESCALATE"
              ? "The evidence didn't support enough of this answer for the system to stand behind it."
              : "Checks ran in a reduced mode, so this answer needs clinician review before use.",
        }
      : kind === "caution"
        ? {
            tone: "warn",
            title: "Use with caution",
            body:
              open > 0
                ? `${open} recommendation${open === 1 ? "" : "s"} couldn't be matched to a guideline. Check before acting.`
                : "Check this answer against your own judgement before acting.",
          }
        : null;

  const { l3_nli } = r.guardrail_details;
  const measures: ResultView["measures"] = [];
  if (l3_nli.model_loaded && l3_nli.claims_checked > 0) {
    measures.push({ label: "Evidence match", value: l3_nli.pass_rate });
  }
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
    if (seen) {
      seen.uses += 1;
      if (STATUS_RANK[status] > STATUS_RANK[seen.status]) seen.status = status;
    } else
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
      kind === "review" || r.trust_score === null
        ? null
        : { label: RESULT_LABEL[kind], bars: barsFor(r.trust_score, kind) },
    banner,
    reducedAccuracy: !r.guardrail_details.l3_nli.model_loaded,
    claims: { verified, total: r.citations.length },
    measures,
    stability: r.guardrail_details.l2_entropy?.stability ?? null,
    sources: [...byTitle.values()],
    seconds: ((r.retrieval_ms + r.generation_ms) / 1000).toFixed(1),
    detailsNotStored:
      r.citations.length === 0 && (r.cited_chunk_ids?.length ?? 0) > 0,
    generatedBy: generatedByView(r.generated_by),
    references: referencesView(r.cited_sources),
  };
}
