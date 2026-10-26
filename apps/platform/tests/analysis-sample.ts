import type {
  AGuarded,
  AnalysisQuery,
  ViewId,
} from "@/lib/api/analysis-contract";
import { createMockPlatform } from "@/lib/api/mock";
import { emptyQuery } from "@/lib/analysis/filters";
import { readView, type ViewRead } from "@/lib/analysis/read";
import { ADA } from "./render";

export type OkRead<V extends ViewId> = Extract<ViewRead<V>, { status: "ok" }>;

export const ALL: AnalysisQuery = emptyQuery("all", null);
export const HAVANA: AnalysisQuery = emptyQuery("hospital", "h_havana");

/** One view of the sample, read as the page reads it. */
export async function sampleRead<V extends ViewId>(
  view: V,
  q: AnalysisQuery = ALL,
): Promise<OkRead<V>> {
  const api = createMockPlatform({ delayMs: 0, me: () => ADA.email });
  const raw = await api.getAnalysisView(view, q);
  const read = readView(view, raw, q);
  if (read.status !== "ok") throw new Error(`the sample ${view} should read`);
  return read as OkRead<V>;
}

export const HIDDEN: AGuarded = { value: null, suppressed: true };
export const shown = (value: number): AGuarded => ({
  value,
  suppressed: false,
});
