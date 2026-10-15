import type {
  ClinicalResultOut,
  FeedbackIn,
  FeedbackOut,
  QueryCreateIn,
  QueryStatusOut,
  Readiness,
} from "./contract";
import { createMockClient } from "./mock";

export interface MhaiClient {
  createQuery(q: QueryCreateIn): Promise<{ query_id: string }>;
  getStatus(id: string): Promise<QueryStatusOut>;
  getResult(id: string): Promise<ClinicalResultOut>;
  sendFeedback(f: FeedbackIn): Promise<FeedbackOut>;
  getReadiness(): Promise<Readiness>;
}

let client: MhaiClient | undefined;

/** Plan 1 ships mock mode only. Plan 2 adds the live client behind the BFF. */
export function getClient(): MhaiClient {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== "true") {
    throw new Error(
      "Live API client arrives in Plan 2. Set NEXT_PUBLIC_USE_MOCK=true.",
    );
  }
  return (client ??= createMockClient());
}
