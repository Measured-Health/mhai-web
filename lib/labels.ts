import type { Citation, Stage } from "./api/contract";

export type ResultKind = "high" | "caution" | "review";

export const RESULT_LABEL: Record<ResultKind | "failed", string> = {
  high: "High confidence",
  caution: "Use with caution",
  review: "Needs review",
  failed: "Couldn't complete",
};

export const STAGES: readonly { id: Stage; label: string }[] = [
  { id: "pii_masking", label: "Protecting patient privacy" },
  { id: "retrieval", label: "Searching medical guidelines" },
  { id: "generation", label: "Generating clinical assessment" },
  { id: "nli_verification", label: "Verifying against evidence" },
  { id: "hga_verification", label: "Running safety checks" },
  { id: "decision", label: "Finalising recommendation" },
];

/** Zero-based index of the current step. Unknown or not-yet-started is the first step. */
export function stageIndex(stage: Stage | null | undefined): number {
  return Math.max(
    0,
    STAGES.findIndex((s) => s.id === stage),
  );
}

export const FORBIDDEN_TERMS = [
  "trust score",
  "NLI",
  "entropy",
  "PASS",
  "REGENERATE",
  "ESCALATE",
  "guardrail",
  "KB",
] as const;

export function citationTag(action: Citation["action"]): {
  label: string;
  tone: "ok" | "warn" | "bad";
} {
  if (action === "PASS") return { label: "Verified", tone: "ok" };
  if (action === "FLAG") return { label: "Needs review", tone: "warn" };
  return { label: "Removed: unsupported", tone: "bad" };
}

export type SourceStatus = "verified" | "review" | "removed";

export function sourceStatus(action: Citation["action"]): SourceStatus {
  if (action === "PASS") return "verified";
  if (action === "FLAG") return "review";
  return "removed";
}
