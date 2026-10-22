// The one place the operations codes become words (UI design v3 §6). Nothing
// else prints a part, step, error kind, job type or job status. A value not
// listed here is never shown raw: the block that holds it fails closed.
import type {
  ErrorKind,
  JobStatus,
  JobType,
  PartKey,
  PartStatus,
  StepKey,
} from "@/lib/api/ops-contract";

export const partLabel: Record<PartKey, string> = {
  app: "Sign-in and the app",
  workers: "Answering questions",
  evidence: "Checking evidence",
  documents: "Reading documents",
  guidelines: "Finding guidelines",
  clean_up: "Records clean-up",
};

export const stepLabel: Record<StepKey, string> = {
  privacy: "Protecting patient privacy",
  guidelines: "Finding guidelines",
  answer: "Writing the answer",
  evidence: "Checking evidence",
};

export const errorKindLabel: Record<ErrorKind, string> = {
  timeout: "Took too long",
  unreachable: "Couldn't reach a service",
  unreadable: "Unreadable document",
  invalid: "Request refused as invalid",
  other: "Other",
};

export const statusWords: Record<PartStatus, string> = {
  ok: "Working normally",
  slow: "Slower than usual",
  problem: "Having problems",
};
export const COULDNT_CHECK = "Couldn't check";

export const TRIAGE_LABEL = "Triage";

export const jobTypeLabel: Record<JobType, string> = {
  run_query: "Answer a question",
  submit_feedback: "Save feedback",
  approve_correction: "Approve a correction",
  ingest_document: "Read a document",
  run_triage: "Triage",
  kb_search: "Search guidelines",
  feedback_buffer_reset: "Reset learning data",
  retention_purge: "Records clean-up",
};

export const jobStatusLabel: Record<JobStatus, string> = {
  failed: "Failed",
  retrying: "Retrying",
  retried: "Retried",
  cancelled: "Cancelled",
};
