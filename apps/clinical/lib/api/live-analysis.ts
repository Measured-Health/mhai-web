import type { AnalysisClient } from "./analysis";
import type { AnalysisFilters } from "./analysis-contract";
import { createLiveClearances } from "./live-clearances";
import { apiOk, keyHeader } from "./request";

/** Nulls are dropped; `source` goes only when set. */
export function filterParams(f: AnalysisFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("from", f.from);
  p.set("to", f.to);
  if (f.condition) p.set("condition", f.condition);
  if (f.age_band) p.set("age_band", f.age_band);
  if (f.sex) p.set("sex", f.sex);
  if (f.location) p.set("location", f.location);
  if (f.setting) p.set("setting", f.setting);
  if (f.specialty) p.set("specialty", f.specialty);
  if (f.source) p.set("source", f.source);
  return p;
}

/** The Analysis API through this app's /api/v1 proxy (the token stays server-side). */
export function createLiveAnalysisClient({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): AnalysisClient {
  const get = <T>(path: string) => apiOk<T>(fetchImpl, path, { method: "GET" });
  const clearances = createLiveClearances({ fetchImpl });
  return {
    getFilterOptions: () => get("/analysis/filters"),
    getView: (view, f) =>
      get(`/analysis/${encodeURIComponent(view)}?${filterParams(f)}`),
    listPatients: ({ drill, level, filters }) => {
      const p = new URLSearchParams({ drill, level });
      for (const [k, v] of filterParams(filters)) p.set(k, v);
      return get(`/analysis/patients?${p}`);
    },
    listNamedPatients: ({ drill, purpose, note, filters }, opts) =>
      apiOk(fetchImpl, "/analysis/patients/named", {
        method: "POST",
        body: { drill, purpose, ...(note ? { note } : {}), filters },
        headers: keyHeader(opts),
      }),
    getClearanceMe: () => get("/analysis/clearance/me"),
    getNamedAccess: () => clearances.getNamedAccess(),
  };
}
