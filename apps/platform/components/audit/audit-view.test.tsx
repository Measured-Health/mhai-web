import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditPerson } from "@/lib/api/audit-contract";
import { checkpointOf, seedAudit } from "@/lib/api/audit-fixtures";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import type { AuditMockOptions } from "@/lib/api/mock-audit";
import { createStepUp } from "@/lib/api/step-up";
import { FROM_AFTER_TO } from "@/lib/audit/dates";
import { gapLine } from "@/lib/audit/words";
import { dateLabel } from "@/lib/format";
import { __resetReportedForTests } from "@/lib/queries/audit";
import { renderWithAuth } from "@/tests/render";
import { OFFLINE_NOTE } from "../states/offline-strip";
import { AuditView } from "./audit-view";
import { SEARCH_WHOLE_LOG } from "./event-filters";

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/audit",
  useRouter: () => nav,
  useSearchParams: () => new URLSearchParams(),
}));

function setup(
  audit?: AuditMockOptions,
  over: (m: PlatformClient) => Partial<PlatformClient> = () => ({}),
) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => TEAM_EMAILS.ada,
    stepUp: createStepUp(),
    audit,
  });
  const c = { ...m, ...over(m) } as PlatformClient;
  __setPlatformClientForTests(c);
  return m;
}

beforeEach(() => {
  nav.push.mockClear();
  nav.replace.mockClear();
  __resetReportedForTests();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const table = () => screen.getByRole("table", { name: "Audit log events" });
/** The body rows of the events table. */
const rows = () => within(table()).getAllByRole("row").slice(1);
/** A row's cell by column: Time, Who, Hospital, Action, Outcome, Flags. */
const COL = { time: 0, who: 1, hospital: 2, action: 3, outcome: 4, flags: 5 };
const cell = (r: HTMLElement, c: keyof typeof COL) =>
  r.children[COL[c]]?.textContent ?? "";
const select = (name: string) => screen.getByRole("combobox", { name });
const pick = (name: string, option: string) =>
  userEvent.setup().selectOptions(select(name), option);

/** Types a day into a date input, then leaves it (dates apply on blur). */
function day(label: string, value: string) {
  const input = screen.getByLabelText(label);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

async function customRange(from: string, to: string) {
  await pick("Dates", "Custom");
  day("From", from);
  day("To", to);
}

/** A `listAudit` spy over the mock's own. */
function spyList() {
  let listAudit!: ReturnType<typeof vi.fn<PlatformClient["listAudit"]>>;
  const m = setup(undefined, (c) => {
    listAudit = vi.fn(c.listAudit);
    return { listAudit };
  });
  return { m, listAudit };
}

describe("the Audit log page", () => {
  it("opens on Events, newest first, with '{n} events' and the Intact header line", async () => {
    setup();
    renderWithAuth(<AuditView />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Audit log" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Events" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await screen.findByRole("table", { name: "Audit log events" });
    expect(screen.getByText(/^\d[\d,]* events?$/)).toBeInTheDocument();
    const times = rows().map((r) =>
      Date.parse(r.querySelector("time")!.getAttribute("datetime")!),
    );
    expect(times.length).toBeGreaterThan(1);
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(
      await screen.findByRole("button", {
        name: /^Integrity: Intact · checked /,
      }),
    ).toBeInTheDocument();
  });

  it("the footer reads the exact copy, with the oldest date", async () => {
    setup();
    renderWithAuth(<AuditView />);
    const oldest = dateLabel(checkpointOf(Date.now()).before);
    expect(
      await screen.findByText(
        `Kept for at least 6 years. The oldest entry is from ${oldest}. No question text, answers or patient names are recorded here. Times on screen are local; files use UTC.`,
      ),
    ).toBeInTheDocument();
  });

  it("Platform only shows platform events; a removed hospital is listed as '(removed)'", async () => {
    setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("option", { name: "Old Mill Clinic (removed)" });
    expect(
      screen.getAllByRole("option", { name: "All hospitals" }),
    ).toHaveLength(1);
    await pick("Hospital", "Platform only");
    await waitFor(() => {
      const r = rows();
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) expect(cell(row, "hospital")).toBe("Platform");
    });
  });

  it("the person picker searches and filters by the chosen id; two people with the same name stay apart", async () => {
    const twins: AuditPerson[] = [
      {
        id: "u_twin_1",
        name: "Folake Adeyemi",
        email: "folake.adeyemi@hv.example",
        role: "clinician",
        kind: "staff",
        hospital: { id: "h_havana", name: "Havana Hospital" },
      },
      {
        id: "u_twin_2",
        name: "Folake Adeyemi",
        email: "f.adeyemi@ng.example",
        role: "reviewer",
        kind: "staff",
        hospital: { id: "h_northgate", name: "Northgate General Hospital" },
      },
    ];
    let listAudit!: ReturnType<typeof vi.fn<PlatformClient["listAudit"]>>;
    setup(undefined, (c) => {
      listAudit = vi.fn(c.listAudit);
      return {
        listAudit,
        searchAuditPeople: async (q) =>
          q.startsWith("fol") ? { people: twins } : c.searchAuditPeople(q),
      };
    });
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });

    // A real person from the sample: only their entries.
    const box = screen.getByRole("combobox", { name: "Person" });
    expect(box).toHaveAttribute("aria-expanded", "false");
    await u.type(box, "Ada");
    const ada = await screen.findByRole("option", {
      name: "Ada Bakare · Platform admin · Measured Health · ada.bakare@measured-health.example",
    });
    expect(box).toHaveAttribute("aria-expanded", "true");
    await u.click(ada);
    await waitFor(() =>
      expect(listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ person: "tm_ada" }),
        undefined,
      ),
    );
    await waitFor(() => {
      const r = rows();
      expect(r.length).toBeGreaterThan(0);
      for (const row of r) expect(cell(row, "who")).toMatch(/^Ada Bakare · /);
    });
    await u.click(screen.getByRole("button", { name: "Clear person" }));

    // Two people with one name: each option is its own person.
    const again = screen.getByRole("combobox", { name: "Person" });
    await u.type(again, "fol");
    const opts = await screen.findAllByRole("option", {
      name: /^Folake Adeyemi · /,
    });
    expect(opts.map((o) => o.textContent)).toEqual([
      "Folake Adeyemi · Clinician · Havana Hospital · folake.adeyemi@hv.example",
      "Folake Adeyemi · Reviewer · Northgate General Hospital · f.adeyemi@ng.example",
    ]);
    await u.click(opts[1]!);
    await waitFor(() =>
      expect(listAudit).toHaveBeenLastCalledWith(
        expect.objectContaining({ person: "u_twin_2" }),
        undefined,
      ),
    );
    expect(
      screen.getByText(
        "Folake Adeyemi · Reviewer · Northgate General Hospital · f.adeyemi@ng.example",
      ),
    ).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Clear person" }));
    await waitFor(() =>
      expect(listAudit.mock.lastCall?.[0]).not.toHaveProperty("person"),
    );
  });

  it("Action type with Audit selected shows this session's own audit_viewed entry", async () => {
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    const button = screen.getByRole("button", { name: "Action type (all)" });
    await u.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    await u.click(screen.getByRole("checkbox", { name: "Audit" }));
    await u.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Action type (1)" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.getByRole("button", { name: "Action type (1)" }),
    ).toHaveFocus();
    await waitFor(() => {
      const r = rows();
      expect(r.length).toBeGreaterThan(0);
      for (const row of r)
        expect(cell(row, "action")).toMatch(/audit log|check|export/i);
      expect(
        r.some(
          (row) =>
            cell(row, "action") === "Viewed the audit log" &&
            cell(row, "who").startsWith("Ada Bakare · "),
        ),
      ).toBe(true);
    });
  });

  it("ticking 5 action types makes 1 read, when the popover closes", async () => {
    const { listAudit } = spyList();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    const before = listAudit.mock.calls.length;
    await u.click(screen.getByRole("button", { name: "Action type (all)" }));
    for (const name of ["Sign-in", "Account", "Audit", "Export", "Security"])
      await u.click(screen.getByRole("checkbox", { name }));
    await new Promise((r) => setTimeout(r, 50));
    expect(listAudit).toHaveBeenCalledTimes(before);
    await u.click(screen.getByRole("button", { name: "Done" }));
    expect(
      screen.getByRole("button", { name: "Action type (5)" }),
    ).toHaveFocus();
    await screen.findByRole("table", { name: "Audit log events" });
    await new Promise((r) => setTimeout(r, 50));
    expect(listAudit).toHaveBeenCalledTimes(before + 1);
    expect(listAudit.mock.lastCall![0].type).toEqual([
      "sign_in",
      "account",
      "export",
      "audit",
      "security",
    ]);
  });

  it("typing a custom date makes 1 read, when the field is left", async () => {
    const { listAudit } = spyList();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await pick("Dates", "Custom");
    await screen.findByRole("table", { name: "Audit log events" });
    const before = listAudit.mock.calls.length;
    const from = screen.getByLabelText("From");
    // A year typed digit by digit: each step is a real day.
    for (const v of ["0002-09-01", "0020-09-01", "0202-09-01", "2026-09-01"])
      fireEvent.change(from, { target: { value: v } });
    await new Promise((r) => setTimeout(r, 50));
    expect(listAudit).toHaveBeenCalledTimes(before);
    fireEvent.keyDown(from, { key: "Enter" });
    await screen.findByRole("table", { name: "Audit log events" });
    await new Promise((r) => setTimeout(r, 50));
    expect(listAudit).toHaveBeenCalledTimes(before + 1);
    expect(listAudit.mock.lastCall![0].from).toBe(
      new Date(2026, 8, 1).toISOString(),
    );
  });

  it("Refused and Flagged only find the locked sign-in", async () => {
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await pick("Dates", "Last 12 months");
    await pick("Outcome", "Refused");
    await u.click(screen.getByRole("checkbox", { name: "Flagged only" }));
    await waitFor(() => {
      const r = rows();
      expect(
        r.some(
          (row) =>
            cell(row, "action") === "Sign-in locked after too many tries",
        ),
      ).toBe(true);
      for (const row of r) {
        expect(cell(row, "outcome")).toMatch(/^Refused/);
        expect(cell(row, "flags")).toContain("Security");
      }
    });
  });

  it("searching a pseudonym finds the named drill-downs", async () => {
    const seed = seedAudit(Date.now());
    const named = seed.events.filter((e) => e.kind === "drilldown_named");
    const p = seed.pseudonyms[named[0]!.id]![0]!;
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await u.type(
      screen.getByRole("searchbox", { name: "Search by exact id" }),
      `${p}{Enter}`,
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(cell(rows()[0]!, "action")).toMatch(
      /^Opened a named patient list · \d+ patients?$/,
    );
    // The list never shows a pseudonym.
    expect(table()).not.toHaveTextContent(p);
    await u.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() => expect(rows().length).toBeGreaterThan(1));
    expect(
      screen.getByRole("searchbox", { name: "Search by exact id" }),
    ).toHaveValue("");
  });

  it("a custom range From after To shows the error and doesn't fetch", async () => {
    let listAudit!: ReturnType<typeof vi.fn<PlatformClient["listAudit"]>>;
    setup(undefined, (c) => {
      listAudit = vi.fn(c.listAudit);
      return { listAudit };
    });
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await pick("Dates", "Custom");
    await screen.findByRole("table", { name: "Audit log events" });
    const before = listAudit.mock.calls.length;
    // To first: the prefilled From is already after it.
    day("To", "2026-03-10");
    day("From", "2026-03-20");
    expect(await screen.findByText(FROM_AFTER_TO)).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveAccessibleDescription(
      FROM_AFTER_TO,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(listAudit).toHaveBeenCalledTimes(before);
    expect(
      screen.queryByRole("table", { name: "Audit log events" }),
    ).toBeNull();
  });

  it("a range before the oldest entry shows the gap line and Nothing matches these filters", async () => {
    setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await customRange("2019-01-01", "2019-12-31");
    const cp = checkpointOf(Date.now());
    expect(
      await screen.findByText("Nothing matches these filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        gapLine(new Date(2019, 0, 1).toISOString(), cp.before, cp)!,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("0 events")).toBeInTheDocument();
  });

  it("Load more appends 50", async () => {
    const { m, listAudit } = spyList();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await pick("Dates", "Last 12 months");
    await waitFor(() => expect(rows()).toHaveLength(50));
    const [filters, cursor] = listAudit.mock.lastCall!;
    expect(cursor).toBeUndefined();
    await u.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rows()).toHaveLength(100));
    // Load more sends the same filters and a cursor, so it isn't a new read.
    const [again, next] = listAudit.mock.lastCall!;
    expect(again).toEqual(filters);
    expect(next).toEqual(expect.any(String));
    const views = async () =>
      (await m.listAudit({ type: ["audit"] })).events.filter(
        (e) => e.kind === "audit_viewed",
      ).length;
    await views(); // the first call is itself a new set
    const n = await views();
    await m.listAudit(filters, next);
    expect(await views()).toBe(n);
  });

  it("with matchCount 20,000 the count reads More than 10,000 events", async () => {
    setup({ matchCount: 20_000 });
    renderWithAuth(<AuditView />);
    expect(
      await screen.findByText("More than 10,000 events"),
    ).toBeInTheDocument();
  });

  it("the bad option shows two 'can't be displayed' rows with id and position, reports them once, and shows the rest", async () => {
    let report!: ReturnType<
      typeof vi.fn<PlatformClient["reportUndisplayable"]>
    >;
    setup({ bad: true }, (c) => {
      report = vi.fn(c.reportUndisplayable);
      return { reportUndisplayable: report };
    });
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    const bad = rows().filter((r) =>
      r.textContent!.startsWith("This entry can't be displayed"),
    );
    expect(bad).toHaveLength(2);
    for (const r of bad)
      expect(r.textContent).toMatch(
        /^This entry can't be displayed · ev_\d+ · #\d+$/,
      );
    expect(table()).not.toHaveTextContent("Sample Name");
    expect(table()).not.toHaveTextContent("Signed in from the ward");
    expect(rows().length).toBeGreaterThan(2);
    await waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    const ids = bad.map((r) => /ev_\d+/.exec(r.textContent!)![0]);
    expect([...report.mock.calls[0]![0]].sort()).toEqual([...ids].sort());

    // A new filter set and back: the same rows aren't reported again.
    await pick("Outcome", "Succeeded");
    await pick("Outcome", "All");
    await waitFor(() =>
      expect(
        rows().filter((r) =>
          r.textContent!.startsWith("This entry can't be displayed"),
        ),
      ).toHaveLength(2),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("Couldn't load the audit log with Try again when unavailable", async () => {
    let down = true;
    setup(undefined, (c) => ({
      listAudit: async (f, cursor) => {
        if (down) throw new Error("down");
        return c.listAudit(f, cursor);
      },
    }));
    renderWithAuth(<AuditView />);
    expect(
      await screen.findByText("Couldn't load the audit log."),
    ).toBeInTheDocument();
    down = false;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("table", { name: "Audit log events" }),
    ).toBeInTheDocument();
  });

  it("Couldn't load the audit log when the mock is unavailable", async () => {
    setup({ unavailable: true });
    renderWithAuth(<AuditView />);
    expect(
      await screen.findByText("Couldn't load the audit log."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  it("offline disables Load more and Search with the reason", async () => {
    setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await pick("Dates", "Last 12 months");
    await screen.findByRole("button", { name: "Load more" });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => void window.dispatchEvent(new Event("offline")));
    for (const name of ["Load more", "Search"]) {
      const b = screen.getByRole("button", { name });
      expect(b).toBeDisabled();
      expect(b).toHaveAccessibleDescription(OFFLINE_NOTE);
    }
    expect(screen.getAllByText(OFFLINE_NOTE)[0]).toBeVisible();
    vi.restoreAllMocks();
    act(() => void window.dispatchEvent(new Event("online")));
  });

  it("at phone width rows are cards", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    setup();
    renderWithAuth(<AuditView />);
    const list = await screen.findByRole("list", { name: "Audit log events" });
    expect(screen.queryByRole("table")).toBeNull();
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]!.querySelector("time")).not.toBeNull();
  });

  it("the URL stays /audit after filtering and searching, and storage stays empty", async () => {
    localStorage.clear();
    sessionStorage.clear();
    const pushState = vi.spyOn(history, "pushState");
    const replaceState = vi.spyOn(history, "replaceState");
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await u.click(screen.getByRole("button", { name: "Action type (all)" }));
    await u.click(screen.getByRole("checkbox", { name: "Platform" }));
    await u.click(screen.getByRole("button", { name: "Done" }));
    await pick("Hospital", "Platform only");
    await pick("Outcome", "Succeeded");
    await u.type(
      screen.getByRole("searchbox", { name: "Search by exact id" }),
      "req_abc{Enter}",
    );
    await screen.findByText("Nothing matches these filters");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
    expect(document.title).not.toContain("req_abc");
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("an id search covers the whole log: an old pseudonym is found, and the filters wait", async () => {
    const seed = seedAudit(Date.now());
    const named = seed.events.filter((e) => e.kind === "drilldown_named");
    const oldest = named[named.length - 1]!;
    expect(Date.now() - Date.parse(oldest.at)).toBeGreaterThan(30 * 86_400_000);
    const p = seed.pseudonyms[oldest.id]![0]!;
    const { listAudit } = spyList();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await pick("Outcome", "Refused");
    await u.type(
      screen.getByRole("searchbox", { name: "Search by exact id" }),
      `${p}{Enter}`,
    );
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(listAudit).toHaveBeenLastCalledWith({ q: p }, undefined);
    expect(cell(rows()[0]!, "action")).toMatch(/^Opened a named patient list/);
    expect(screen.getByText(SEARCH_WHOLE_LOG)).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Filters" }),
    ).toHaveAccessibleDescription(SEARCH_WHOLE_LOG);
    // The filters are kept, and apply again once the search is cleared.
    expect(select("Outcome")).toHaveValue("refused");
    await u.click(screen.getByRole("button", { name: "Clear search" }));
    await waitFor(() =>
      expect(listAudit.mock.lastCall![0]).toEqual(
        expect.objectContaining({ outcome: "refused" }),
      ),
    );
    expect(screen.queryByText(SEARCH_WHOLE_LOG)).toBeNull();
  });

  it("the filters note's status element is always mounted, so the note is announced", async () => {
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    const note = () =>
      document.querySelector<HTMLElement>('p[role="status"][id$="-searching"]');
    const status = note();
    expect(status).not.toBeNull();
    expect(status).toBeEmptyDOMElement();
    await u.type(
      screen.getByRole("searchbox", { name: "Search by exact id" }),
      "ev_1{Enter}",
    );
    await waitFor(() => expect(status).toHaveTextContent(SEARCH_WHOLE_LOG));
    expect(note()).toBe(status);
  });

  it("tabbing out of the open Action type popover applies the ticks, like Escape", async () => {
    const { listAudit } = spyList();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await u.click(screen.getByRole("button", { name: "Action type (all)" }));
    await u.click(screen.getByRole("checkbox", { name: "Audit" }));
    for (let i = 0; i < 30; i++) {
      if (screen.queryByRole("button", { name: "Action type (1)" })) break;
      await u.tab();
    }
    expect(
      screen.getByRole("button", { name: "Action type (1)" }),
    ).toHaveAttribute("aria-expanded", "false");
    await waitFor(() =>
      expect(listAudit.mock.lastCall![0]).toEqual(
        expect.objectContaining({ type: ["audit"] }),
      ),
    );
  });

  it("the person picker moves focus to Clear on choosing, and back to the input on Clear", async () => {
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await u.type(screen.getByRole("combobox", { name: "Person" }), "Ada");
    await screen.findByRole("option", { name: /^Ada Bakare · / });
    await u.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Clear person" })).toHaveFocus();
    await u.keyboard("{Enter}");
    expect(screen.getByRole("combobox", { name: "Person" })).toHaveFocus();
  });

  it("the header says Couldn't check when the status can't be read, never Intact", async () => {
    for (const getIntegrityStatus of [
      async () => {
        throw new Error("down");
      },
      // A malformed reply: the run keys are missing.
      async () => ({ oldest_kept_at: "2020-10-22T00:00:00Z" }),
    ]) {
      setup(
        undefined,
        () =>
          ({
            getIntegrityStatus,
          }) as unknown as Partial<PlatformClient>,
      );
      const { unmount } = renderWithAuth(<AuditView />);
      expect(
        await screen.findByRole("button", {
          name: "Integrity: Couldn't check",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Intact/)).toBeNull();
      unmount();
    }
  });
});
