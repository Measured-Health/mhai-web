import type {
  AnalysisFilters,
  FilterOptionsOut,
  PatientLevel,
  PatientsOut,
  ViewId,
  ViewOut,
} from "./analysis-contract";
import { createLiveAnalysisClient } from "./live-analysis";
import { createMockAnalysis } from "./mock-analysis";

/** The Analysis side's calls. Everything is scoped to one hospital. */
export interface AnalysisClient {
  getFilterOptions(): Promise<FilterOptionsOut>;
  getView<V extends ViewId>(view: V, f: AnalysisFilters): Promise<ViewOut[V]>;
  listPatients(q: {
    drill: string;
    level: PatientLevel;
    filters: AnalysisFilters;
  }): Promise<PatientsOut>;
}

let analysis: AnalysisClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAnalysisClient(): AnalysisClient {
  return (analysis ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAnalysis()
      : createLiveAnalysisClient());
}
