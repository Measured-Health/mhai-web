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

  it("asks for names with the purpose and note, and reads clearance/me", async () => {
    await client().listPatients({
      drill: "cond-e11",
      level: "named",
      filters: empty,
      purpose: "other",
      note: "Ward 4 follow-up & recall",
    });
    await client().listPatients({
      drill: "cond-e11",
      level: "named",
      filters: empty,
      purpose: "audit",
    });
    // A purpose is never sent with the de-identified list.
    await client().listPatients({
      drill: "cond-e11",
      level: "deidentified",
      filters: empty,
      purpose: "audit",
      note: "x",
    });
    await client().getClearanceMe();
    expect(urls()).toEqual([
      "/api/v1/analysis/patients?drill=cond-e11&level=named&from=2026-01-01&to=2026-03-31&purpose=other&note=Ward+4+follow-up+%26+recall",
      "/api/v1/analysis/patients?drill=cond-e11&level=named&from=2026-01-01&to=2026-03-31&purpose=audit",
      "/api/v1/analysis/patients?drill=cond-e11&level=deidentified&from=2026-01-01&to=2026-03-31",
      "/api/v1/analysis/clearance/me",
    ]);
  });

  it("reads the switch through named-access, a 404 as Off", async () => {
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ position: "on", since: "2026-09-16T10:00:00.000Z" }),
    );
    expect(await client().getNamedAccess()).toEqual({
      position: "on",
      since: "2026-09-16T10:00:00.000Z",
    });
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "not_found" }, { status: 404 }),
    );
    expect(await client().getNamedAccess()).toEqual({
      position: "off",
      since: null,
    });
    expect(urls()).toEqual([
      "/api/v1/analysis/named-access",
      "/api/v1/analysis/named-access",
    ]);
  });

  it("turns a named refusal into its code", async () => {
    fetchImpl.mockImplementationOnce(async () =>
      Response.json({ code: "not_cleared" }, { status: 403 }),
    );
    const e = await client()
      .listPatients({
        drill: "x",
        level: "named",
        filters: empty,
        purpose: "audit",
      })
      .catch((x) => x);
    expect(e).toMatchObject({ status: 403, code: "not_cleared" });
  });
});
