// The words for the operations screens (health and failed jobs). The one
// place a job type, job status or error kind becomes words; nothing else
// prints a code.
import type { ErrorKind, JobStatus, JobType } from "@/lib/api/ops-contract";

const JOB_TYPE: Record<JobType, string> = {
  run_query: "Answer a question",
  submit_feedback: "Save feedback",
  approve_correction: "Approve a correction",
  ingest_document: "Read a document",
  run_triage: "Triage",
  kb_search: "Search guidelines",
  feedback_buffer_reset: "Reset learning data",
  retention_purge: "Records clean-up",
};
const JOB_STATUS: Record<JobStatus, string> = {
  failed: "Failed",
  retrying: "Retrying",
  retried: "Retried",
  cancelled: "Cancelled",
};
const ERROR_KIND: Record<ErrorKind, string> = {
  timeout: "Took too long",
  unreachable: "Couldn't reach a service",
  unreadable: "Unreadable document",
  invalid: "Request refused as invalid",
  other: "Other",
};

export const jobTypeLabel = (t: JobType) => JOB_TYPE[t];
export const jobStatusLabel = (s: JobStatus) => JOB_STATUS[s];
export const errorKindLabel = (k: ErrorKind) => ERROR_KIND[k];
