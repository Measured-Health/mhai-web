import type {
  ClinicalResultOut,
  FeedbackIn,
  FeedbackOut,
  QueryCreateIn,
  QueryStatusOut,
  Readiness,
} from "./contract";
import { createLiveClient } from "./live";
import { createMockClient } from "./mock";

export interface MhaiClient {
  createQuery(q: QueryCreateIn): Promise<{ query_id: string }>;
  getStatus(id: string): Promise<QueryStatusOut>;
  getResult(id: string): Promise<ClinicalResultOut>;
  sendFeedback(f: FeedbackIn): Promise<FeedbackOut>;
  getReadiness(): Promise<Readiness>;
}

let client: MhaiClient | undefined;

/** Mock data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getClient(): MhaiClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockClient()
      : createLiveClient());
}
