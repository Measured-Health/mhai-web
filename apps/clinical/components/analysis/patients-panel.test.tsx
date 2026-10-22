import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from "@tanstack/react-query";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import type { GuardedOut } from "@/lib/api/admin-contract";
import type { AnalysisClient } from "@/lib/api/analysis";
import type {
  CoOccurringOut,
  Drillable,
  FindingsOut,
  Meta,
  PatientRowOut,
  PatientsOut,
  PrevalenceOut,
} from "@/lib/api/analysis-contract";
import { createMockAdmin } from "@/lib/api/mock-admin";
import { createMockAnalysis } from "@/lib/api/mock-analysis";
import { resetAudit } from "@/lib/api/mock-audit";
import { describeEvent } from "@/lib/admin/activity";
import { defaultFilters } from "@/lib/analysis/filters";

const holder = vi.hoisted(() => ({
  client: null as unknown as AnalysisClient,
}));
vi.mock("@/lib/api/analysis", () => ({
  getAnalysisClient: () => holder.client,
}));
import { AffectedView } from "./affected-view";
import { CoOccurringView } from "./co-occurring-view";
import { FindingsView } from "./findings-view";
import { PatientsPanel } from "./patients-panel";
import { PrevalenceView } from "./prevalence-view";

const F90 = defaultFilters("2026-10-22");

const S = (value: number): GuardedOut => ({ value, suppressed: false });
const H: GuardedOut = { value: null, suppressed: true };
const D = (g: GuardedOut, drill: string | null = null): Drillable => ({
  ...g,
  drill,
});
const meta = (patients: GuardedOut): Meta => ({
  updated_at: "2026-10-22T06:00:00.000Z",
  from: "2026-07-24",
  to: "2026-10-22",
  bucket: "week",
  patients,
});
const E11 = { id: "e11", name: "Type 2 diabetes", icd10: "E11" };
const A15 = { id: "a15", name: "Tuberculosis", icd10: "A15" };

/** Type 2 diabetes shown and drillable; tuberculosis hidden. */
const PREV: PrevalenceOut = {
  ...meta(S(300)),
  total: { cases: S(120), new: S(30), existing: S(90) },
  by_condition: [
    {
      condition: E11,
      cases: D(S(60), "cond-e11"),
      new: S(10),
      existing: S(50),
    },
    { condition: A15, cases: D(H), new: H, existing: H },
  ],
  series: [{ start: "2026-07-24", cases: S(20), new: S(5) }],
};

const row = (i: number, extra: Partial<PatientRowOut> = {}): PatientRowOut => ({
  pid: `P-${String(1000 + i)}`,
  age_band: "40-64",
  sex: "female",
  setting: null,
  conditions: [E11],
  findings: [{ name: "HbA1c", flag: "high", source_label: "Main lab" }],
  ...extra,
});
const reply = (count: number, rows: PatientRowOut[]): PatientsOut => ({
  level: "deidentified",
  count,
  patients: rows,
});

let qc: QueryClient;
const renderWith = (ui: ReactElement) =>
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
const patientQueries = () =>
  qc.getQueryCache().findAll({ queryKey: ["analysis", "patients"] });

/** The prevalence view with PREV, its rows sent by the stub. */
function prevalenceWith(list: AnalysisClient["listPatients"]) {
  holder.client = {
    ...holder.client,
    getView: (async () => structuredClone(PREV)) as AnalysisClient["getView"],
    listPatients: list,
  };
  renderWith(<PrevalenceView filters={F90} />);
}
const seeButton = () => screen.findByRole("button", { name: /^See patients/ });
async function openList() {
  const b = await seeButton();
  await userEvent.click(b);
  return { button: b, panel: screen.getByRole("dialog") };
}

function goOffline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}
function goOnline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

beforeEach(() => {
  qc = new QueryClient();
  holder.client = createMockAnalysis({ delayMs: 0 });
  resetAudit();
});
afterEach(() => {
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
});

describe("See patients", () => {
  it("See patients on a shown row opens the list with the de-identified note", async () => {
    const spy = vi.fn(async () =>
      reply(
        6,
        [1, 2, 3, 4, 5, 6].map((i) => row(i)),
      ),
    );
    prevalenceWith(spy);
    const { panel } = await openList();
    expect(panel).toHaveAccessibleName(/patients · Type 2 diabetes · E11$/);
    expect(
      await within(panel).findByRole("heading", {
        name: "6 patients · Type 2 diabetes · E11",
      }),
    ).toBeVisible();
    expect(
      within(panel).getByText("De-identified: no names or record numbers"),
    ).toBeVisible();
    expect(spy).toHaveBeenCalledWith({
      drill: "cond-e11",
      level: "deidentified",
      filters: F90,
    });
    // Never printed, and nothing to export.
    expect(panel.closest(".print\\:hidden")).not.toBeNull();
    expect(
      within(panel).queryByRole("button", { name: /download|export|print/i }),
    ).toBeNull();
  });

  it("a hidden count has no See patients", async () => {
    prevalenceWith(vi.fn());
    const list = await screen.findByRole("list", {
      name: "Cases by condition",
    });
    const [shown, hidden] = within(list).getAllByRole("listitem");
    expect(
      within(shown!).getByRole("button", { name: /^See patients/ }),
    ).toBeInTheDocument();
    expect(hidden).toHaveTextContent("Fewer than 5");
    expect(within(hidden!).queryByRole("button")).toBeNull();
    expect(within(list).getAllByRole("button")).toHaveLength(1);
  });

  it("is disabled offline, with the reason", async () => {
    prevalenceWith(vi.fn());
    const b = await seeButton();
    goOffline();
    try {
      expect(b).toBeDisabled();
      const reason = screen.getByText(
        "You're offline. Reconnect to see patients.",
      );
      expect(b).toHaveAttribute("aria-describedby", reason.id);
    } finally {
      goOnline();
    }
    expect(b).toBeEnabled();
  });
});

describe("PatientsPanel", () => {
  it("rows show the pseudonymous ID, age band, sex and location type, and never a name or MRN", async () => {
    prevalenceWith(async () =>
      reply(5, [
        row(1),
        row(2, { age_band: "80+", sex: "male", setting: "emergency" }),
        row(3, {
          sex: "not_recorded",
          conditions: [{ id: "unmapped", name: null, icd10: null }],
          findings: [{ name: null, flag: "low", source_label: null }],
        }),
        row(4),
        row(5),
      ]),
    );
    const { panel } = await openList();
    const list = await within(panel).findByRole("list", { name: "Patients" });
    const items = within(list).getAllByRole("listitem", { name: /^P-/ });
    expect(items).toHaveLength(5);
    const [a, b, c] = items;
    expect(a).toHaveTextContent("P-1001");
    expect(a).toHaveTextContent("Age 40–64");
    expect(a).toHaveTextContent("Female");
    expect(a).toHaveTextContent("Location not recorded");
    expect(a).toHaveTextContent("Type 2 diabetes · E11");
    expect(a).toHaveTextContent("HbA1c");
    expect(a).toHaveTextContent("High");
    expect(a).toHaveTextContent("Main lab");
    expect(b).toHaveTextContent("Age 80 and over");
    expect(b).toHaveTextContent("Male");
    expect(b).toHaveTextContent("Emergency");
    expect(c).toHaveTextContent("Sex not recorded");
    expect(c).toHaveTextContent("Not standardised");
    expect(c).toHaveTextContent("Low");
    expect(panel.textContent).not.toMatch(/MRN|date of birth|address/i);
    expect(within(panel).queryByText(/Showing the first/)).toBeNull();
  });

  it("a reply with a name fails closed and shows no row", async () => {
    for (const bad of [
      { name: "Jane Doe" },
      { mrn: "MRN-123456" },
      { dob: "1950-01-01" },
      { address: "1 High St" },
    ]) {
      qc = new QueryClient();
      prevalenceWith(async () => ({
        ...reply(
          5,
          [1, 2, 3, 4].map((i) => row(i)),
        ),
        patients: [
          ...[1, 2, 3, 4].map((i) => row(i)),
          { ...row(5), ...bad } as PatientRowOut,
        ],
      }));
      const { panel } = await openList();
      expect(
        await within(panel).findByText("Couldn't load these patients"),
      ).toBeVisible();
      expect(
        within(panel).getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
      expect(
        within(panel).queryByRole("list", { name: "Patients" }),
      ).toBeNull();
      expect(panel.textContent).not.toMatch(/P-100|Jane|MRN-|1950|High St/);
      cleanup();
    }
    // A named level is refused too.
    qc = new QueryClient();
    prevalenceWith(
      async () =>
        ({
          ...reply(
            5,
            [1, 2, 3, 4, 5].map((i) => row(i)),
          ),
          level: "named",
        }) as unknown as PatientsOut,
    );
    const { panel } = await openList();
    expect(
      await within(panel).findByText("Couldn't load these patients"),
    ).toBeVisible();
    expect(panel.textContent).not.toMatch(/P-100/);
  });

  it("200 of 214 shows Showing the first 200 of 214", async () => {
    prevalenceWith(async () =>
      reply(
        214,
        Array.from({ length: 200 }, (_, i) => row(i)),
      ),
    );
    const { panel } = await openList();
    expect(
      await within(panel).findByText("Showing the first 200 of 214"),
    ).toBeVisible();
    expect(
      within(panel).getByRole("heading", {
        name: "214 patients · Type 2 diabetes · E11",
      }),
    ).toBeVisible();
    expect(
      within(
        within(panel).getByRole("list", { name: "Patients" }),
      ).getAllByRole("listitem", { name: /^P-/ }),
    ).toHaveLength(200);
  });

  it("too small reads This group is too small to list", async () => {
    prevalenceWith(async () => {
      throw new ApiError(422, "too_small");
    });
    const { panel } = await openList();
    expect(
      await within(panel).findByText("This group is too small to list"),
    ).toBeVisible();
    expect(within(panel).queryByText(/Couldn't load/)).toBeNull();
    expect(within(panel).queryByRole("list", { name: "Patients" })).toBeNull();
  });

  it("a failed load tries again", async () => {
    let n = 0;
    prevalenceWith(async () => {
      n += 1;
      if (n === 1) throw new ApiError(400, "bad_request");
      return reply(
        5,
        [1, 2, 3, 4, 5].map((i) => row(i)),
      );
    });
    const { panel } = await openList();
    await userEvent.click(
      await within(panel).findByRole("button", { name: "Try again" }),
    );
    expect(
      await within(panel).findByRole("list", { name: "Patients" }),
    ).toBeInTheDocument();
  });

  it("closing returns focus", async () => {
    prevalenceWith(async () =>
      reply(
        5,
        [1, 2, 3, 4, 5].map((i) => row(i)),
      ),
    );
    const { button, panel } = await openList();
    await within(panel).findByRole("list", { name: "Patients" });
    expect(panel.contains(document.activeElement)).toBe(true);
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();

    // Esc too.
    await userEvent.click(button);
    await within(screen.getByRole("dialog")).findByRole("list", {
      name: "Patients",
    });
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("the list is gone from the cache after closing", async () => {
    prevalenceWith(async () =>
      reply(
        5,
        [1, 2, 3, 4, 5].map((i) => row(i)),
      ),
    );
    const { panel } = await openList();
    await within(panel).findByRole("list", { name: "Patients" });
    expect(patientQueries()).toHaveLength(1);
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(patientQueries()).toHaveLength(0));
  });

  it("opening logs an event that Activity shows: opened 37 de-identified patients in Analysis", async () => {
    renderWith(<AffectedView filters={F90} />);
    const ward = await screen.findByRole("list", {
      name: "Patients by ward or clinic",
    });
    const ed = within(ward)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.startsWith("Emergency"))!;
    expect(ed).toHaveTextContent("37");
    await userEvent.click(
      within(ed).getByRole("button", { name: /^See patients/ }),
    );
    const panel = screen.getByRole("dialog");
    expect(
      await within(panel).findByRole("heading", {
        name: "37 patients · Ward or clinic: Emergency",
      }),
    ).toBeVisible();
    const { events } = await createMockAdmin({ delayMs: 0 }).listActivity({});
    const opened = events.filter((e) => e.kind === "analysis_patients_viewed");
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      type: "security",
      flag: null,
      count: 37,
    });
    expect(describeEvent(opened[0]!)).toMatch(
      /opened 37 de-identified patients in Analysis$/,
    );
  });

  it("the level is passed on as given", async () => {
    const spy = vi.fn(async () =>
      reply(
        5,
        [1, 2, 3, 4, 5].map((i) => row(i)),
      ),
    );
    holder.client = { ...holder.client, listPatients: spy };
    renderWith(
      <PatientsPanel
        drill="sex-female"
        label="Sex: Female"
        filters={F90}
        level="deidentified"
        onClose={() => {}}
      />,
    );
    await screen.findByRole("list", { name: "Patients" });
    expect(spy).toHaveBeenCalledWith({
      drill: "sex-female",
      level: "deidentified",
      filters: F90,
    });
    // Nothing about the drill goes in the URL.
    expect(window.location.href).not.toMatch(/sex-female|drill/);
  });
});

const I10 = { id: "i10", name: "Hypertension", icd10: "I10" };
const J45 = { id: "j45", name: "Asthma", icd10: "J45" };
const CO: CoOccurringOut = {
  ...meta(S(300)),
  pairs: [
    {
      a: E11,
      b: I10,
      a_patients: S(100),
      patients: D(S(40), "pair-e11-i10"),
      share_of_a: S(0.4),
    },
    { a: J45, b: E11, a_patients: S(60), patients: D(H), share_of_a: H },
  ],
};
const FIND: FindingsOut = {
  ...meta(S(300)),
  findings: [
    {
      name: "Potassium",
      flag: "low",
      patients: D(S(30), "f1"),
      results: S(50),
    },
    { name: "ECG", flag: "abnormal", patients: D(H), results: H },
  ],
  alerts: {
    total: S(60),
    by_severity: { critical: S(10), urgent: S(20), info: S(30) },
    median_ack_minutes: S(12),
    critical_median_ack_minutes: S(6),
    dismissed: S(15),
    dismiss_reasons: [
      { reason: "not_relevant", count: S(10) },
      { reason: "already_known", count: S(5) },
    ],
  },
};

/** Serve this reply for every view, and five rows for any list. */
function serveView(view: unknown) {
  const spy = vi.fn(async () =>
    reply(
      5,
      [1, 2, 3, 4, 5].map((i) => row(i)),
    ),
  );
  holder.client = {
    ...holder.client,
    getView: (async () => structuredClone(view)) as AnalysisClient["getView"],
    listPatients: spy,
  };
  return spy;
}
const showTable = () =>
  userEvent.click(screen.getByRole("button", { name: "Table" }));
const cellsOf = (r: HTMLElement) =>
  [within(r).getByRole("rowheader"), ...within(r).getAllByRole("cell")].map(
    (c) => c.textContent,
  );

describe("See patients in the other views", () => {
  it("co-occurring: a shown pair opens its list; a hidden pair has no See patients", async () => {
    const spy = serveView(CO);
    renderWith(<CoOccurringView filters={F90} />);
    const list = await screen.findByRole("list", { name: "Patients by pair" });
    const [shown, hidden] = within(list).getAllByRole("listitem");
    expect(within(hidden!).queryByRole("button")).toBeNull();
    await userEvent.click(
      within(shown!).getByRole("button", {
        name: "See patients · Type 2 diabetes + Hypertension",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "5 patients · Type 2 diabetes + Hypertension",
      }),
    ).toBeVisible();
    expect(spy).toHaveBeenCalledWith({
      drill: "pair-e11-i10",
      level: "deidentified",
      filters: F90,
    });
  });

  it("findings: a shown finding opens its list; a hidden one has no See patients", async () => {
    const spy = serveView(FIND);
    renderWith(<FindingsView filters={F90} />);
    const list = await screen.findByRole("list", {
      name: "Patients by finding",
    });
    const [shown, hidden] = within(list).getAllByRole("listitem");
    expect(hidden).toHaveTextContent("Fewer than 5");
    expect(within(hidden!).queryByRole("button")).toBeNull();
    await userEvent.click(
      within(shown!).getByRole("button", {
        name: "See patients · Potassium · Low",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "5 patients · Potassium · Low",
      }),
    ).toBeVisible();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ drill: "f1" }));
    // Alerts are not patients: no See patients there.
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(
      within(
        screen.getByRole("list", { name: "Alerts by severity" }),
      ).queryByRole("button"),
    ).toBeNull();
  });
});

describe("See patients in the tables", () => {
  it("the prevalence table ends with a Patients column; a hidden count has an empty cell", async () => {
    prevalenceWith(async () =>
      reply(
        5,
        [1, 2, 3, 4, 5].map((i) => row(i)),
      ),
    );
    await seeButton();
    await showTable();
    const table = screen.getByRole("table", { name: "Cases by condition" });
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(heads.at(-1)).toBe("Patients");
    const [, shown, hidden] = within(table).getAllByRole("row");
    expect(cellsOf(shown!).at(-1)).toBe("See patients · Type 2 diabetes · E11");
    expect(cellsOf(hidden!).at(-1)).toBe("");
    expect(within(hidden!).queryByRole("button")).toBeNull();
    // It opens the list, and closing gives focus back to it.
    const b = within(shown!).getByRole("button", { name: /^See patients/ });
    await userEvent.click(b);
    const panel = screen.getByRole("dialog");
    await within(panel).findByRole("list", { name: "Patients" });
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(b).toHaveFocus();
  });

  it("the affected, co-occurring and findings tables: See patients only on shown rows", async () => {
    renderWith(<AffectedView filters={F90} />);
    await screen.findByRole("list", { name: "Patients by age band" });
    await showTable();
    const age = screen.getByRole("table", { name: "Patients by age band" });
    expect(
      within(age)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Age band", "Patients", "Patients"]);
    expect(cellsOf(within(age).getAllByRole("row")[1]!).at(-1)).toBe(
      "See patients · Age band: 0–17",
    );
    cleanup();

    qc = new QueryClient();
    serveView(CO);
    renderWith(<CoOccurringView filters={F90} />);
    await screen.findByRole("list", { name: "Patients by pair" });
    await showTable();
    let rows = within(
      screen.getByRole("table", { name: "Conditions found together" }),
    ).getAllByRole("row");
    expect(cellsOf(rows[1]!).at(-1)).toBe(
      "See patients · Type 2 diabetes + Hypertension",
    );
    expect(cellsOf(rows[2]!).at(-1)).toBe("");
    expect(within(rows[2]!).queryByRole("button")).toBeNull();
    cleanup();

    qc = new QueryClient();
    serveView(FIND);
    renderWith(<FindingsView filters={F90} />);
    await screen.findByRole("list", { name: "Patients by finding" });
    await showTable();
    const findings = screen.getByRole("table", { name: "Findings" });
    expect(
      within(findings)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Finding", "Flag", "Patients", "Results", "Patients"]);
    rows = within(findings).getAllByRole("row");
    expect(cellsOf(rows[1]!).at(-1)).toBe("See patients · Potassium · Low");
    expect(cellsOf(rows[2]!).at(-1)).toBe("");
    expect(
      within(
        screen.getByRole("table", { name: "Alerts by severity" }),
      ).queryByRole("button"),
    ).toBeNull();
  });

  it("is disabled offline in the table too, with the reason", async () => {
    prevalenceWith(vi.fn());
    await seeButton();
    await showTable();
    goOffline();
    try {
      const b = within(
        screen.getByRole("table", { name: "Cases by condition" }),
      ).getByRole("button", { name: /^See patients/ });
      expect(b).toBeDisabled();
      expect(b).toHaveAttribute(
        "aria-describedby",
        screen.getByText("You're offline. Reconnect to see patients.").id,
      );
    } finally {
      goOnline();
    }
  });

  it("on a phone, See patients is the card's action, and a hidden card has none", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    try {
      prevalenceWith(async () =>
        reply(
          5,
          [1, 2, 3, 4, 5].map((i) => row(i)),
        ),
      );
      await seeButton();
      await showTable();
      expect(screen.queryByRole("table")).toBeNull();
      const cards = screen.getByRole("list", { name: "Cases by condition" });
      const [shown, hidden] = within(cards).getAllByRole("listitem");
      // Not a label-and-value pair: the card's action, after the numbers.
      expect(within(shown!).queryByText("Patients")).toBeNull();
      const b = within(shown!).getByRole("button", {
        name: "See patients · Type 2 diabetes · E11",
      });
      expect(shown!.lastElementChild).toContainElement(b);
      expect(within(hidden!).queryByRole("button")).toBeNull();
      await userEvent.click(b);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
