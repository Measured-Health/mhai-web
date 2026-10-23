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
  DeidentifiedPatientsOut,
  Drillable,
  FindingsOut,
  Meta,
  PatientRowOut,
  PrevalenceOut,
} from "@/lib/api/analysis-contract";
import { createMockAdmin } from "@/lib/api/mock-admin";
import { createMockAnalysis } from "@/lib/api/mock-analysis";
import { resetAudit } from "@/lib/api/mock-audit";
import { describeEvent } from "@/lib/admin/activity";
import { defaultFilters } from "@/lib/analysis/filters";
import { resetClearances } from "@/lib/api/mock-clearances";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import type { User } from "@/lib/auth/types";
import { screenAdminAs } from "@/tests/admin";
import {
  GRACE,
  NAMED_FILTERS,
  OBI,
  analysisAs,
  renderSignedIn,
  showNames,
} from "@/tests/named";

const holder = vi.hoisted(() => ({
  client: null as unknown as AnalysisClient,
}));
vi.mock("@/lib/api/analysis", () => ({
  getAnalysisClient: () => holder.client,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/analysis",
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
const reply = (
  count: number,
  rows: PatientRowOut[],
): DeidentifiedPatientsOut => ({
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

  it("portals the panel to the page, with print:hidden on its own root", async () => {
    prevalenceWith(
      vi.fn(async () =>
        reply(
          6,
          [1, 2, 3, 4, 5, 6].map((i) => row(i)),
        ),
      ),
    );
    const { panel } = await openList();
    const root = panel.parentElement!;
    // The panel's own root sits on document.body, not inside a card.
    expect(root.parentElement).toBe(document.body);
    expect(root).toHaveClass("fixed", "inset-0", "print:hidden");
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
      { ward_bed: "4B" },
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
        }) as unknown as DeidentifiedPatientsOut,
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
    expect(heads.at(-1)).toBe("Patient list");
    expect(new Set(heads).size).toBe(heads.length);
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
    ).toEqual(["Age band", "Patients", "Patient list"]);
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
    ).toEqual(["Finding", "Flag", "Patients", "Results", "Patient list"]);
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

describe("Named access in the patients panel", () => {
  const namedPanel = (
    user: User,
    namedAccess: "off" | "letters_only" | "on" = "on",
    over: Partial<AnalysisClient> = {},
  ) => {
    resetClearances();
    holder.client = {
      ...analysisAs(user, screenAdminAs(DEMO_EMAILS.director), namedAccess),
      ...over,
    };
    renderSignedIn(
      <PatientsPanel
        drill="sex-female"
        label="Sex: Female"
        filters={NAMED_FILTERS}
        onClose={() => {}}
      />,
      user,
      qc,
    );
    return screen.findByRole("list", { name: "Patients" });
  };
  const NEEDS_LETTER =
    "Named access needs a clearance letter. Ask your hospital admin.";

  it("Grace sees Show names; choosing Clinical follow-up shows Name and MRN under the named banner", async () => {
    await namedPanel(GRACE);
    const listNamed = vi.spyOn(holder.client, "listNamedPatients");
    const table = await showNames("Clinical follow-up");
    const heads = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(heads.slice(0, 2)).toEqual(["Name", "MRN"]);
    const first = within(table).getAllByRole("row")[1]!;
    // The Name column holds a name, not a record number.
    const name = within(first).getByRole("rowheader").textContent!;
    expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
    expect(within(first).getAllByRole("cell")[0]).toHaveTextContent(
      /^HH-\d{6}$/,
    );
    expect(
      screen.getByText(
        /^Named view · letter until \d{1,2} \w{3} \d{4} · this view is recorded$/,
      ),
    ).toBeVisible();
    // The purpose went in the body, with a key; no note for this purpose.
    expect(listNamed).toHaveBeenCalledTimes(1);
    const [body, opts] = listNamed.mock.calls[0]!;
    expect(body).toEqual({
      drill: "sex-female",
      purpose: "clinical_follow_up",
      filters: NAMED_FILTERS,
    });
    expect(opts.idempotencyKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(window.location.href).not.toMatch(/clinical_follow_up|purpose/);
  });

  it("Other needs a note, of at most 200 characters", async () => {
    await namedPanel(GRACE);
    const listNamed = vi.spyOn(holder.client, "listNamedPatients");
    await userEvent.click(
      await screen.findByRole("button", { name: "Show names" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Show names" });
    const radios = within(dialog).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual([
      "Clinical follow-up",
      "Quality improvement",
      "Audit",
      "Other",
    ]);
    await userEvent.click(within(dialog).getByRole("radio", { name: "Other" }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Show names" }),
    );
    expect(within(dialog).getByText("✕ Add a note for Other.")).toBeVisible();
    expect(listNamed).not.toHaveBeenCalled();
    const note = within(dialog).getByRole("textbox");
    expect(note).toHaveAttribute("maxlength", "200");
    await userEvent.type(note, "Ward 4 recall");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Show names" }),
    );
    await screen.findByRole("table", { name: /^Named patients/ });
    expect(listNamed.mock.calls[0]![0]).toMatchObject({
      purpose: "other",
      note: "Ward 4 recall",
    });
  });

  it("a clinician-analyst without a letter sees Named access needs a clearance letter, and no button", async () => {
    // Dr. Obi has only a waiting letter (ruling 9).
    await namedPanel(OBI);
    expect(await screen.findByText(NEEDS_LETTER)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show names" })).toBeNull();
  });

  it("with the switch Letters only nothing about names shows", async () => {
    const getMe = vi.fn();
    await namedPanel(GRACE, "letters_only", { getClearanceMe: getMe });
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Show names" })).toBeNull();
    expect(screen.queryByText(NEEDS_LETTER)).toBeNull();
    expect(screen.queryByText(/Named/)).toBeNull();
    expect(getMe).not.toHaveBeenCalled();
  });

  it("without named access nothing about names shows, and nothing is asked", async () => {
    const getAccess = vi.fn();
    await namedPanel({ ...GRACE, features: { analysis: true } }, "on", {
      getNamedAccess: getAccess,
    });
    expect(screen.queryByRole("button", { name: "Show names" })).toBeNull();
    expect(getAccess).not.toHaveBeenCalled();
  });

  it("the panel is hidden in print and has no copy or export", async () => {
    await namedPanel(GRACE);
    await showNames("Audit");
    const dialog = screen.getByRole("dialog", {
      name: /patients · Sex: Female$/,
    });
    expect(dialog.closest(".print\\:hidden")).not.toBeNull();
    const named = document.querySelector("[data-named-view]")!;
    expect(named).toHaveClass("print:hidden");
    expect(
      within(dialog).queryByRole("button", {
        name: /download|export|print|copy/i,
      }),
    ).toBeNull();
    expect(within(dialog).queryByRole("link")).toBeNull();
  });

  it("a failed check offers Try again, not Show names", async () => {
    await namedPanel(GRACE, "on", {
      getClearanceMe: () => Promise.reject(new ApiError(403, "forbidden")),
    });
    expect(
      await screen.findByText("Couldn't load your named access"),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show names" })).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("Show names is disabled offline", async () => {
    await namedPanel(GRACE);
    const b = await screen.findByRole("button", { name: "Show names" });
    goOffline();
    try {
      expect(b).toBeDisabled();
      const reason = screen.getByText(
        "You're offline. Reconnect to show names.",
      );
      expect(b).toHaveAttribute("aria-describedby", reason.id);
    } finally {
      goOnline();
    }
    expect(b).toBeEnabled();
  });
});
