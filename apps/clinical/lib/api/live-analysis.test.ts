import { beforeEach, describe, expect, it, vi } from "vitest";

const unauthorized = vi.hoisted(() => vi.fn());
vi.mock("../auth/events", () => ({ reportUnauthorized: unauthorized }));
import type { AnalysisFilters } from "./analysis-contract";
import { ApiError } from "./errors";
import { createLiveAnalysisClient } from "./live-analysis";

const fetchImpl = vi.fn<typeof fetch>();
const client = () => createLiveAnalysisClient({ fetchImpl });
const urls = () => fetchImpl.mock.calls.map((c) => c[0]);
beforeEach(() => {
  fetchImpl.mockReset();
  unauthorized.mockReset();
  fetchImpl.mockImplementation(async () => Response.json({}));
});

const empty: AnalysisFilters = {
  from: "2026-01-01",
  to: "2026-03-31",
  condition: null,
  age_band: null,
  sex: null,
  location: null,
  setting: null,
  specialty: null,
  source: null,
};

describe("live analysis client", () => {
  it("reads the three paths, dropping nulls from the query", async () => {
    await client().getFilterOptions();
    await client().getView("prevalence", empty);
    await client().getView("co-occurring", {
      ...empty,
      condition: "e11",
      age_band: "80+",
      sex: "female",
      setting: "admitted",
      location: "ward4",
      specialty: "General medicine",
    });
    await client().listPatients({
      drill: "cond-e11",
      level: "deidentified",
      filters: { ...empty, source: "main_record" },
    });
    expect(urls()).toEqual([
      "/api/v1/analysis/filters",
      "/api/v1/analysis/prevalence?from=2026-01-01&to=2026-03-31",
      "/api/v1/analysis/co-occurring?from=2026-01-01&to=2026-03-31&condition=e11&age_band=80%2B&sex=female&location=ward4&setting=admitted&specialty=General+medicine",
      "/api/v1/analysis/patients?drill=cond-e11&level=deidentified&from=2026-01-01&to=2026-03-31&source=main_record",
    ]);
    expect((fetchImpl.mock.calls[0] as [string, RequestInit])[1]).toMatchObject(
      { method: "GET", credentials: "same-origin" },
    );
  });

  it("returns what the API sent and turns a refusal into its code", async () => {
    fetchImpl.mockImplementationOnce(async () => Response.json({ a: 1 }));
    expect(await client().getFilterOptions()).toEqual({ a: 1 });
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "too_small" }, { status: 422 }),
    );
    const e = await client()
      .listPatients({ drill: "x", level: "deidentified", filters: empty })
      .catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 422, code: "too_small" });
  });
});
