import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { MOCK_CODE, createStepUp } from "@/lib/api/step-up";
import { seedAudit } from "@/lib/api/audit-fixtures";
import { __resetReportedForTests } from "@/lib/queries/audit";
import { renderWithAuth } from "@/tests/render";
import { OFFLINE_NOTE } from "../states/offline-strip";
import { AuditView } from "./audit-view";
import { NamedAccessTab } from "./named-access-tab";

vi.mock("next/navigation", () => ({
  usePathname: () => "/audit",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOTE =
  "Names and MRNs are never recorded here. Patients appear only by the hospital's pseudonymous id; the hospital can match them to its own records.";
const NEED = "Choose one hospital, and a letter or dates.";
const LETTER = "cl_northgate_2026";

function setup(
  over: (m: PlatformClient) => Partial<PlatformClient> = () => ({}),
) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => TEAM_EMAILS.ada,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests({ ...m, ...over(m) } as PlatformClient);
  return m;
}

beforeEach(() => __resetReportedForTests());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const select = (name: string) => screen.getByRole("combobox", { name });

/** Adds a second hospital and letter to what the mock answers. */
function twoLetters(m: PlatformClient): Partial<PlatformClient> {
  return {
    listNamedAccess: async (f, cursor) => {
      const r = await m.listNamedAccess(f, cursor);
      const first = r.events[0]!;
      const other = {
        ...first,
        id: "ev_other_1",
        seq: 99_001,
        hospital: { id: "h_other", name: "Other Hospital", removed: false },
        letter: {
          ...first.letter,
          id: "cl_other_2026",
          status: "ended" as const,
        },
        refs: { ...first.refs, clearance_id: "cl_other_2026" },
      };
      const keep =
        f.clearance && f.clearance !== "cl_other_2026" ? [] : [other];
      return { ...r, events: [...r.events, ...keep] };
    },
  };
}

describe("the Named access tab", () => {
  it("rows are grouped by hospital and letter, with the letter's status and dates", async () => {
    setup(twoLetters);
    renderWithAuth(<NamedAccessTab />);
    await userEvent.selectOptions(select("Dates"), "Last 12 months");
    await waitFor(() =>
      expect(
        screen.getByRole("group", { name: new RegExp(LETTER) }),
      ).toBeVisible(),
    );
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("group", { name: new RegExp(LETTER) }),
        ).getAllByRole("row"),
      ).toHaveLength(1 + 3),
    );
    const g = screen.getByRole("group", { name: new RegExp(LETTER) });
    expect(g).toHaveAccessibleName(
      /^cl_northgate_2026 · Active · Valid \d+ \w+ \d{4} to \d+ \w+ \d{4} · Verified by Tunde Okafor$/,
    );
    const other = screen.getByRole("group", { name: /cl_other_2026/ });
    expect(other).toHaveAccessibleName(/^cl_other_2026 · Ended · Valid /);
    expect(
      screen.getByRole("heading", { name: "Other Hospital" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Northgate General Hospital" }),
    ).toBeInTheDocument();
    // Each row: who, when, the view, the count and the purpose.
    const row = within(g).getAllByRole("row")[1]!;
    expect(row.querySelector("time")).not.toBeNull();
    expect(row).toHaveTextContent(/\d+ patients/);
    expect(row).toHaveTextContent(
      /Clinical follow-up|Quality improvement|Audit/,
    );
    expect(row).toHaveTextContent(
      /Prevalence and trends|Who is affected|Co-occurring conditions|Findings and alerts|MHAI quality/,
    );
  });

  it("no pseudonym appears on the tab", async () => {
    const seed = seedAudit(Date.now());
    const some = Object.values(seed.pseudonyms)[0]![0]!;
    setup();
    const { container } = renderWithAuth(<NamedAccessTab />);
    await screen.findByRole("group", { name: new RegExp(LETTER) });
    expect(container.textContent).not.toMatch(/P-[0-9A-F]{6}/);
    expect(container.textContent).not.toContain(some);
  });

  it("the note reads the exact copy", async () => {
    setup();
    renderWithAuth(<NamedAccessTab />);
    expect(await screen.findByText(NOTE)).toBeVisible();
  });

  it("the letter filter narrows to cl_northgate_2026", async () => {
    setup(twoLetters);
    renderWithAuth(<NamedAccessTab />);
    await screen.findByRole("group", { name: /cl_other_2026/ });
    const box = screen.getByLabelText("Clearance letter id");
    fireEvent.change(box, { target: { value: LETTER } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() =>
      expect(screen.queryByRole("group", { name: /cl_other_2026/ })).toBeNull(),
    );
    expect(
      await screen.findByRole("group", { name: /cl_northgate_2026/ }),
    ).toBeVisible();
  });

  it("'Any date' is offered only while a letter is set", async () => {
    setup();
    renderWithAuth(<NamedAccessTab />);
    await screen.findByRole("group", { name: /cl_northgate_2026/ });
    const anyDate = () =>
      within(select("Dates")).queryByRole("option", { name: "Any date" });
    expect(anyDate()).toBeNull();
    const box = screen.getByLabelText("Clearance letter id");
    fireEvent.change(box, { target: { value: LETTER } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(anyDate()).not.toBeNull());
    await userEvent.selectOptions(select("Dates"), "Any date");
    expect(select("Dates")).toHaveValue("any");
    // Clearing the letter goes back to Last 30 days.
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(select("Dates")).toHaveValue("30d"));
    expect(anyDate()).toBeNull();
  });

  it("reading the list is recorded once per filter set, like the other lists", async () => {
    const m = setup();
    const f = { hospital: "h_northgate", clearance: LETTER };
    await m.listNamedAccess(f);
    await m.listNamedAccess(f);
    const log = await m.listAudit({ type: ["audit"] });
    const seen = log.events.filter(
      (e) =>
        e.kind === "audit_viewed" &&
        e.actor.name === "Ada Bakare" &&
        (e.facts.filters as Record<string, unknown> | undefined)?.clearance ===
          LETTER,
    );
    expect(seen).toHaveLength(1);
    // It names its list: Named access, not Events.
    expect(seen[0]!.facts.list).toBe("named_access");
  });

  it("an unusable letter id is refused", async () => {
    setup();
    renderWithAuth(<NamedAccessTab />);
    const box = screen.getByLabelText("Clearance letter id");
    fireEvent.change(box, { target: { value: "a b!" } });
    fireEvent.blur(box);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter an exact letter id: letters, numbers, - and _ only.",
    );
  });

  it("nothing matching shows the empty words", async () => {
    setup();
    renderWithAuth(<NamedAccessTab initial={{ clearance: "cl_nobody" }} />);
    expect(
      await screen.findByText("Nothing matches these filters"),
    ).toBeVisible();
  });

  it("couldn't load offers Try again", async () => {
    let fail = true;
    setup((m) => ({
      listNamedAccess: async (f, c) => {
        if (fail) throw new Error("down");
        return m.listNamedAccess(f, c);
      },
    }));
    renderWithAuth(<NamedAccessTab />);
    expect(
      await screen.findByText(/Couldn't load the audit log/),
    ).toBeVisible();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("group", { name: /cl_northgate/ }),
    ).toBeVisible();
  });

  it("Load more fetches the next page", async () => {
    setup((m) => ({
      listNamedAccess: async (f, cursor) => {
        const r = await m.listNamedAccess(f);
        return cursor
          ? { events: r.events.slice(2), next_cursor: null }
          : { events: r.events.slice(0, 2), next_cursor: "c1" };
      },
    }));
    renderWithAuth(<NamedAccessTab initial={{ clearance: LETTER }} />);
    const g = await screen.findByRole("group", { name: /cl_northgate/ });
    expect(within(g).getAllByRole("row")).toHaveLength(1 + 2);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("group", { name: /cl_northgate/ }),
        ).getAllByRole("row"),
      ).toHaveLength(1 + 3),
    );
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("phone: cards", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    setup();
    renderWithAuth(<NamedAccessTab initial={{ clearance: LETTER }} />);
    const g = await screen.findByRole("group", { name: /cl_northgate/ });
    expect(within(g).queryByRole("table")).toBeNull();
    const items = within(g).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]!.querySelector("time")).not.toBeNull();
  });
});

describe("Export for a legal request", () => {
  async function ready() {
    return screen.findByRole("dialog", { name: /^Export exp_\w+ is ready$/ });
  }

  it("needs one hospital and a letter or dates", async () => {
    setup();
    renderWithAuth(<NamedAccessTab />);
    await screen.findByRole("group", { name: /cl_northgate/ });
    const btn = screen.getByRole("button", {
      name: "Export for a legal request",
    });
    // Dates are set (Last 30 days) but no hospital.
    expect(btn).toBeDisabled();
    expect(screen.getByText(NEED)).toBeVisible();
    await userEvent.selectOptions(select("Hospital"), "h_northgate");
    expect(btn).toBeEnabled();
    expect(screen.queryByText(NEED)).toBeNull();
  });

  it("a hospital with a letter and Any date exports; clearing the letter goes back to dates, never to neither", async () => {
    setup();
    renderWithAuth(
      <NamedAccessTab
        initial={{ hospital: "h_northgate", clearance: LETTER }}
      />,
    );
    await screen.findByRole("group", { name: /cl_northgate/ });
    const btn = screen.getByRole("button", {
      name: "Export for a legal request",
    });
    expect(btn).toBeEnabled();
    const box = screen.getByLabelText("Clearance letter id");
    await userEvent.selectOptions(select("Dates"), "Any date");
    expect(btn).toBeEnabled();
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.blur(box);
    await waitFor(() => expect(select("Dates")).toHaveValue("30d"));
    expect(btn).toBeEnabled();
    expect(screen.queryByText(NEED)).toBeNull();
  });

  it("is off while offline", async () => {
    setup();
    renderWithAuth(
      <NamedAccessTab
        initial={{ hospital: "h_northgate", clearance: LETTER }}
      />,
    );
    await screen.findByRole("group", { name: /cl_northgate/ });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(
      await screen.findByRole("button", { name: "Export for a legal request" }),
    ).toBeDisabled();
    expect(screen.getAllByText(OFFLINE_NOTE)[0]).toBeVisible();
    vi.restoreAllMocks();
    act(() => void window.dispatchEvent(new Event("online")));
  });

  it("it makes a .zip export that shows in the Exports tab", async () => {
    const saved: { name: string }[] = [];
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: (b: Blob) => (blobs.push(b), `blob:${blobs.length}`),
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push({ name: this.download });
    });
    const m = setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await u.click(screen.getByRole("tab", { name: "Named access" }));
    await screen.findByRole("group", { name: /cl_northgate/ });
    await u.selectOptions(select("Hospital"), "h_northgate");
    await u.click(
      screen.getByRole("button", { name: "Export for a legal request" }),
    );
    const d = await screen.findByRole("dialog", {
      name: "Export named access for a legal request",
    });
    await u.click(within(d).getByLabelText("Legal request"));
    await u.click(within(d).getByLabelText("Digit 1 of 6"));
    await u.keyboard(MOCK_CODE);
    await u.click(within(d).getByRole("button", { name: "Make export" }));
    const r = await ready();
    const rec = (await m.listExports()).exports[0]!;
    expect(rec.kind).toBe("named_access");
    await u.click(within(r).getByRole("button", { name: "Download file" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]!.name).toMatch(
      new RegExp(`^audit-named-access-${rec.id}-\\d{8}-\\d{4}Z\\.zip$`),
    );
    await u.click(within(r).getByRole("button", { name: "Close" }));
    await u.click(screen.getByRole("tab", { name: "Exports" }));
    const table = await screen.findByRole("table", { name: "Audit exports" });
    const row = within(table).getByText(rec.id).closest("tr")!;
    expect(row).toHaveTextContent("Named access");
    expect(row).toHaveTextContent("Legal request");
  });
});

describe("in the audit log", () => {
  it("the tab order is Events, Named access, Exports, Integrity", async () => {
    setup();
    renderWithAuth(<AuditView />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Events",
      "Named access",
      "Exports",
      "Integrity",
    ]);
  });

  it("Open in Named access from an event lands here, filtered to its hospital and letter, with no URL change", async () => {
    const push = vi.spyOn(history, "pushState");
    const replace = vi.spyOn(history, "replaceState");
    setup();
    const u = userEvent.setup();
    renderWithAuth(<AuditView />);
    await screen.findByRole("table", { name: "Audit log events" });
    await u.click(
      (
        await screen.findAllByRole("button", {
          name: /Opened a named patient list/,
        })
      )[0]!,
    );
    const d = await screen.findByRole("dialog");
    await u.click(
      await within(d).findByRole("button", { name: "Open in Named access" }),
    );
    expect(screen.getByRole("tab", { name: "Named access" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("Clearance letter id")).toHaveValue(LETTER);
    expect(select("Hospital")).toHaveValue("h_northgate");
    expect(
      await screen.findByRole("group", { name: /cl_northgate/ }),
    ).toBeVisible();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(location.search).toBe("");
  });
});
