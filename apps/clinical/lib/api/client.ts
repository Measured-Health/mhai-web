import type {
  ClinicalResultOut,
  CorrectionOut,
  FeedbackIn,
  FeedbackOut,
  FeedbackStatsOut,
  QueryCreateIn,
  QueryStatusOut,
  Readiness,
  RejectIn,
  WriteOpts,
} from "./contract";
import { createLiveClient } from "./live";
import { createMockClient } from "./mock";

export interface MhaiClient {
  createQuery(
    q: QueryCreateIn,
    opts?: { idempotencyKey?: string },
  ): Promise<{ query_id: string }>;
  getStatus(id: string): Promise<QueryStatusOut>;
  getResult(id: string): Promise<ClinicalResultOut>;
  sendFeedback(
    f: FeedbackIn,
    opts?: { idempotencyKey?: string },
  ): Promise<FeedbackOut>;
  getReadiness(): Promise<Readiness>;
  /** Others' waiting corrections; the API never lists your own here. */
  listPendingCorrections(): Promise<CorrectionOut[]>;
  /** Your own corrections, every status, newest first. */
  listMyCorrections(): Promise<CorrectionOut[]>;
  /** Corrections you decided as a reviewer, newest first. */
  listMyReviews(): Promise<CorrectionOut[]>;
  approveCorrection(id: string, opts?: WriteOpts): Promise<void>;
  rejectCorrection(id: string, r: RejectIn, opts?: WriteOpts): Promise<void>;
  withdrawCorrection(id: string, opts?: WriteOpts): Promise<void>;
  getMyFeedbackStats(): Promise<FeedbackStatsOut>;
}

let client: MhaiClient | undefined;

/** Mock data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getClient(): MhaiClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockClient()
      : createLiveClient());
}
