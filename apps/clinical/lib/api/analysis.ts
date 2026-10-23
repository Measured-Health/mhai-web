import type {
  AnalysisFilters,
  ClearanceMeOut,
  FilterOptionsOut,
  NamedPurpose,
  PatientLevel,
  PatientsOut,
  ViewId,
  ViewOut,
} from "./analysis-contract";
import type { ClearanceClient } from "./clearances";
import { createLiveAnalysisClient } from "./live-analysis";
import { createMockAnalysis } from "./mock-analysis";

/** The Analysis side's calls. Everything is scoped to one hospital. */
export interface AnalysisClient {
  getFilterOptions(): Promise<FilterOptionsOut>;
  getView<V extends ViewId>(view: V, f: AnalysisFilters): Promise<ViewOut[V]>;
  /** `purpose` (and `note`, needed for "other") go only with `level: "named"`. */
  listPatients(q: {
    drill: string;
    level: PatientLevel;
    filters: AnalysisFilters;
    purpose?: NamedPurpose;
    note?: string;
  }): Promise<PatientsOut>;
  /** Whether this person may see names right now; never cached. */
  getClearanceMe(): Promise<ClearanceMeOut>;
  /** The clearance client's switch position, for the Analysis page. */
  getNamedAccess: ClearanceClient["getNamedAccess"];
}

let analysis: AnalysisClient | undefined;

/** Sample data when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getAnalysisClient(): AnalysisClient {
  return (analysis ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockAnalysis()
      : createLiveAnalysisClient());
}
