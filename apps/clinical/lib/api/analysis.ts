import type {
  AnalysisFilters,
  ClearanceMeOut,
  DeidentifiedPatientsOut,
  FilterOptionsOut,
  NamedPatientsIn,
  NamedPatientsOut,
  ViewId,
  ViewOut,
} from "./analysis-contract";
import type { ClearanceClient } from "./clearances";
import type { WriteOpts } from "./contract";
import { createLiveAnalysisClient } from "./live-analysis";
import { createMockAnalysis } from "./mock-analysis";

/** The Analysis side's calls. Everything is scoped to one hospital. */
export interface AnalysisClient {
  getFilterOptions(): Promise<FilterOptionsOut>;
  getView<V extends ViewId>(view: V, f: AnalysisFilters): Promise<ViewOut[V]>;
  /** The de-identified list, a GET; names are only ever the POST below (Plan 11c). */
  listPatients(q: {
    drill: string;
    level: "deidentified";
    filters: AnalysisFilters;
  }): Promise<DeidentifiedPatientsOut>;
  /**
   * The named list: a POST, so the purpose and note are never in a URL. It
   * records a view, so it carries an Idempotency-Key and a retry is one view.
   */
  listNamedPatients(
    q: NamedPatientsIn,
    opts: WriteOpts & { idempotencyKey: string },
  ): Promise<NamedPatientsOut>;
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
