import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  QueryClient,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import type { AnalysisClient } from "@/lib/api/analysis";
import type { AnalysisFilters } from "@/lib/api/analysis-contract";
import { ApiError } from "@/lib/api/errors";
import { resetAudit } from "@/lib/api/mock-audit";
import {
  createMockClearances,
  endOfHospitalDay,
  resetClearances,
} from "@/lib/api/mock-clearances";
import { useAuth } from "@/lib/auth/auth-context";
import { createStepUp, DEMO_EMAILS, MOCK_CODE } from "@/lib/auth/mock";
import type { User } from "@/lib/auth/types";
import { screenAdminAs } from "@/tests/admin";
import {
  GRACE,
  KEMI,
  NAMED_FILTERS,
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
import { NamedView, watermarkTile } from "./named-view";
import { PatientsPanel } from "./patients-panel";

let qc: QueryClient;
let admin: AdminClient;

beforeEach(() => {
  resetClearances();
  resetAudit();
  qc = new QueryClient();
  admin = screenAdminAs(DEMO_EMAILS.director);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  onlineManager.setOnline(true);
  focusManager.setFocused(undefined);
});

const SECOND = 1000;
const MINUTE = 60 * SECOND;

const panel = (filters: AnalysisFilters = NAMED_FILTERS) => (
  <PatientsPanel
    drill="sex-female"
    label="Sex: Female"
    filters={filters}
    onClose={() => {}}
  />
);

function open(user: User, ui = panel()) {
  holder.client = analysisAs(user, admin);
  return renderSignedIn(ui, user, qc);
}

/** userEvent on fake timers that still move with real time. */
function fakeClock() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

const namedQueries = () =>
  qc.getQueryCache().findAll({ queryKey: ["analysis", "patients", "named"] });

/** Every bit of data in the cache, as one string. */
const cached = () =>
  JSON.stringify(
    qc
      .getQueryCache()
      .getAll()
      .map((q) => q.state.data),
  );

/** The ended notice: said politely, with the focus, and the reason. */
/**
 * The ended notice, with the reason, said once: focused (and read) when the
 * focus was in the view, else spoken by the panel's polite region.
 */
async function ended(reason: string, { focused = true } = {}) {
  const title = await screen.findByText("Named access has ended");
  const notice = title.closest<HTMLElement>("[data-named-ended]")!;
  // Not itself a live region: never read twice.
  expect(notice).not.toHaveAttribute("role");
  expect(notice).not.toHaveAttribute("aria-live");
  expect(notice).toHaveTextContent(reason);
  const spoken = `Named access has ended. ${reason}`;
  // The notice's effect takes the focus or writes the region. That effect
  // can run in a later task than the commit `findByText` saw (the update
  // comes from the query cache, outside act), so wait for its outcome
  // before checking that the other one didn't happen.
  if (focused) {
    await waitFor(() => expect(notice).toHaveFocus());
    expect(screen.queryByText(spoken)).toBeNull();
  } else {
    expect(await screen.findByText(spoken)).toHaveAttribute("role", "status");
    expect(notice).not.toHaveFocus();
  }
  expect(screen.queryByRole("table", { name: /^Named patients/ })).toBeNull();
  // Back to the de-identified rows.
  expect(
    await screen.findByText("De-identified: no names or record numbers"),
  ).toBeVisible();
  expect(await screen.findByRole("list", { name: "Patients" })).toBeVisible();
}

const sharedClearances = (email: string) =>
  createMockClearances({
    me: async () => email,
    delayMs: 0,
    stepUp: createStepUp(() => Date.now()),
    staff: () => admin.listStaff(),
  });

function goOffline() {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

describe("NamedView", () => {
  it("the watermark shows the viewer and the time", async () => {
    const user = fakeClock();
    vi.setSystemTime(new Date(2026, 9, 22, 9, 5));
    open(GRACE);
    await showNames("Audit", undefined, user);
    const mark = document.querySelector<HTMLElement>("[data-watermark]")!;
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveClass("pointer-events-none", "select-none");
    expect(mark).toHaveAttribute("data-watermark", "Grace Nwosu · 09:05");
    // A tile repeated as a background, drawn with the viewer and the time.
    expect(mark).toHaveClass("absolute", "inset-0", "bg-repeat");
    expect(decodeURIComponent(mark.style.backgroundImage)).toContain(
      ">Grace Nwosu · 09:05</text>",
    );
  });

  it("the watermark covers a 200-row list, its whole height and width", async () => {
    open(GRACE);
    const table = await showNames();
    // Grace's group is over 200 patients: the first 200 show.
    expect(within(table).getAllByRole("row")).toHaveLength(201);
    const mark = document.querySelector<HTMLElement>("[data-watermark]")!;
    // The overlay fills the box that is sized to the table's scroll area
    // (not the scrolling frame), so every row and column is under it.
    const box = mark.parentElement!;
    expect(box).toContainElement(table);
    expect(box).toHaveClass("relative", "inline-block", "min-w-full");
    expect(box.parentElement).toHaveClass("overflow-x-auto");
    expect(mark).toHaveClass("absolute", "inset-0", "bg-repeat");
  });

  it("the watermark tile escapes the name", () => {
    const tile = decodeURIComponent(watermarkTile(`A <b>"&'</b> · 09:05`));
    expect(tile).toContain(
      ">A &lt;b&gt;&quot;&amp;&apos;&lt;/b&gt; · 09:05</text>",
    );
    expect(tile).not.toContain("<b>");
  });

  it("after showing names the focus is on the named banner, read once", async () => {
    open(GRACE);
    await showNames();
    const banner = document.querySelector<HTMLElement>("[data-named-banner]")!;
    await waitFor(() => expect(banner).toHaveFocus());
    // The focused banner is read; the polite region doesn't repeat it, and
    // nothing marks the view busy (which would hide the region).
    const view = document.querySelector<HTMLElement>("[data-named-view]")!;
    expect(within(view).getByRole("status")).toHaveTextContent(/^$/);
    expect(view).not.toHaveAttribute("aria-busy");
  });

  it("names loading while you type in a filter: the focus stays, and the region says it", async () => {
    const user = userEvent.setup();
    open(
      GRACE,
      <>
        {panel()}
        <input aria-label="Search conditions" />
      </>,
    );
    const real = holder.client.listNamedPatients;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    vi.spyOn(holder.client, "listNamedPatients").mockImplementation(
      async (b, o) => {
        await gate;
        return real(b, o);
      },
    );
    await user.click(await screen.findByRole("button", { name: "Show names" }));
    const dialog = await screen.findByRole("dialog", { name: "Show names" });
    await user.click(within(dialog).getByRole("radio", { name: "Audit" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Show names" }),
    );
    const view = await waitFor(() =>
      document.querySelector<HTMLElement>("[data-named-view]")!,
    );
    // Loading: the view has the focus, and the region says so.
    await waitFor(() => expect(view).toHaveFocus());
    expect(within(view).getByRole("status")).toHaveTextContent(
      "Loading named patients…",
    );
    const search = screen.getByLabelText("Search conditions");
    act(() => search.focus());
    await user.keyboard("diab");
    await act(async () => release());
    await screen.findByRole("table", { name: /^Named patients/ });
    expect(search).toHaveFocus();
    expect(search).toHaveValue("diab");
    expect(within(view).getByRole("status")).toHaveTextContent(
      /^Names shown\. Named view · letter until .+ · this view is recorded$/,
    );
  });

  it("typing in a filter isn't interrupted when a view ends", async () => {
    const user = userEvent.setup();
    open(
      GRACE,
      <>
        {panel()}
        <input aria-label="Search conditions" />
      </>,
    );
    await showNames("Audit", undefined, user);
    const search = screen.getByLabelText("Search conditions");
    act(() => search.focus());
    await user.keyboard("dia");
    vi.spyOn(holder.client, "listNamedPatients").mockRejectedValue(
      new ApiError(403, "clearance_ended"),
    );
    await act(() =>
      qc.refetchQueries({ queryKey: ["analysis", "patients", "named"] }),
    );
    await ended("The clearance letter has ended.", { focused: false });
    await user.keyboard("betes");
    expect(search).toHaveFocus();
    expect(search).toHaveValue("diabetes");
  });

  it.each([
    ["visibilitychange", () => document],
    ["pageshow", () => window],
    ["focus", () => window],
  ] as const)(
    "after a sleep or a restore, %s ends names on the real clock",
    async (event, target) => {
      const user = fakeClock();
      open(GRACE);
      await showNames("Audit", undefined, user);
      // The clock jumps past named_until while timers were paused.
      vi.setSystemTime(Date.now() + 2 * 60 * MINUTE);
      act(() => {
        target().dispatchEvent(new Event(event));
      });
      expect(
        screen.queryByRole("table", { name: /^Named patients/ }),
      ).toBeNull();
      await ended("This named view has ended. Show names again to continue.");
    },
  );

  it("names go at named_until, offline too", async () => {
    // Kemi's letter ends in 12 days: shortly before the end of its last
    // day, names last only until then (not a whole hour).
    const letter = await sharedClearances(DEMO_EMAILS.analyst).getClearance(
      "cl_soon",
    );
    const end = Date.parse(endOfHospitalDay(letter.end_date));
    const user = fakeClock();
    vi.setSystemTime(end - 20 * MINUTE - 10 * SECOND);
    open(KEMI);
    await showNames("Quality improvement", undefined, user);
    // The timer runs with no server: going offline doesn't keep names.
    goOffline();
    await act(() => vi.advanceTimersByTimeAsync(20 * MINUTE));
    expect(
      screen.getByRole("table", { name: /^Named patients/ }),
    ).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(11 * SECOND));
    await ended("This named view has ended. Show names again to continue.");
    expect(namedQueries()).toHaveLength(0);
  });

  it("names go within 30 seconds of cl_act being revoked in the shared store, with The clearance letter was revoked.", async () => {
    const user = fakeClock();
    open(GRACE);
    await showNames("Clinical follow-up", undefined, user);
    await sharedClearances(DEMO_EMAILS.hospitalAdmin).revokeClearance(
      "cl_act",
      { reason: "no_longer_needed", mfaCode: MOCK_CODE },
      { idempotencyKey: "k-revoke" },
    );
    // Still shown until the next check...
    expect(
      screen.getByRole("table", { name: /^Named patients/ }),
    ).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await ended("The clearance letter was revoked.");
    // ...and then nothing to show names again.
    expect(screen.queryByRole("button", { name: "Show names" })).toBeNull();
    expect(
      screen.getByText(
        "Named access needs a clearance letter. Ask your hospital admin.",
      ),
    ).toBeVisible();
  });

  it("nothing named is left in the query cache after ending", async () => {
    const user = fakeClock();
    open(GRACE);
    await showNames("Clinical follow-up", undefined, user);
    expect(namedQueries()).toHaveLength(1);
    expect(cached()).toMatch(/HH-\d{6}/);
    await sharedClearances(DEMO_EMAILS.hospitalAdmin).revokeClearance(
      "cl_act",
      { reason: "no_longer_needed", mfaCode: MOCK_CODE },
      { idempotencyKey: "k-revoke-2" },
    );
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await ended("The clearance letter was revoked.");
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(namedQueries()).toHaveLength(0);
    expect(cached()).not.toMatch(/HH-\d{6}|"mrn"/);
  });

  it("a revoke ends names within 30 seconds in a hidden tab too", async () => {
    const user = fakeClock();
    open(GRACE);
    await showNames("Clinical follow-up", undefined, user);
    act(() => focusManager.setFocused(false));
    await sharedClearances(DEMO_EMAILS.hospitalAdmin).revokeClearance(
      "cl_act",
      { reason: "no_longer_needed", mfaCode: MOCK_CODE },
      { idempotencyKey: "k-revoke-hidden" },
    );
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await ended("The clearance letter was revoked.");
  });

  it.each([
    ["a 404", () => Promise.reject(new ApiError(404, "not_found"))],
    ["a 401", () => Promise.reject(new ApiError(401, "unauthorized"))],
    ["a 503", () => Promise.reject(new ApiError(503, "unavailable"))],
    ["a malformed reply", async () => ({ named: "yes" }) as never],
  ])("%s from the check ends names (fail closed)", async (_, reply) => {
    const user = fakeClock();
    open(GRACE);
    await showNames("Audit", undefined, user);
    vi.spyOn(holder.client, "getClearanceMe").mockImplementation(reply);
    // The 30-second check, and a 5xx's retries.
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await ended("Your clearance changed.");
    expect(namedQueries()).toHaveLength(0);
  });

  it("a network failure of the check keeps names; named_until still ends them", async () => {
    const user = fakeClock();
    open(GRACE);
    await showNames("Audit", undefined, user);
    vi.spyOn(holder.client, "getClearanceMe").mockRejectedValue(
      new ApiError(0, "network"),
    );
    await act(() => vi.advanceTimersByTimeAsync(5 * MINUTE));
    expect(
      screen.getByRole("table", { name: /^Named patients/ }),
    ).toBeVisible();
    expect(screen.queryByText("Named access has ended")).toBeNull();
    // Grace's view lasts an hour in the sample server.
    await act(() => vi.advanceTimersByTimeAsync(55 * MINUTE));
    await ended("This named view has ended. Show names again to continue.");
  });

  it("a first POST refused 403 not_cleared ends at once, showing no rows", async () => {
    open(GRACE);
    vi.spyOn(holder.client, "listNamedPatients").mockRejectedValue(
      new ApiError(403, "not_cleared"),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Show names" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Show names" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Audit" }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Show names" }),
    );
    await ended("Your clearance changed.");
    expect(cached()).not.toMatch(/HH-\d{6}|"mrn"/);
  });

  it("the switch going down, seen by the position first, ends names with the words", async () => {
    open(GRACE);
    await showNames();
    holder.client = analysisAs(GRACE, admin, "off");
    await act(() =>
      qc.refetchQueries({ queryKey: ["analysis", "named-access"] }),
    );
    await ended("Named access was switched off.");
    expect(namedQueries()).toHaveLength(0);
  });

  it("a 403 clearance_ended on refetch drops the names at once", async () => {
    open(GRACE);
    await showNames();
    vi.spyOn(holder.client, "listNamedPatients").mockRejectedValue(
      new ApiError(403, "clearance_ended"),
    );
    await act(() =>
      qc.refetchQueries({ queryKey: ["analysis", "patients", "named"] }),
    );
    await ended("The clearance letter has ended.");
    expect(namedQueries()).toHaveLength(0);
  });

  it("a 403 that ends access hides the rows on its own render, before onEnd", async () => {
    // The view must not wait for its parent: the refusal's render shows no
    // names, even if nothing has reacted to onEnd yet.
    const onEnd = vi.fn();
    open(
      GRACE,
      <NamedView
        drill="sex-female"
        filters={NAMED_FILTERS}
        purpose="audit"
        onEnd={onEnd}
      />,
    );
    await screen.findByRole("table", { name: /^Named patients/ });
    vi.spyOn(holder.client, "listNamedPatients").mockRejectedValue(
      new ApiError(403, "clearance_ended"),
    );
    await act(() =>
      qc.refetchQueries({ queryKey: ["analysis", "patients", "named"] }),
    );
    await waitFor(() => expect(onEnd).toHaveBeenCalledWith("ended"));
    expect(screen.queryByRole("table", { name: /^Named patients/ })).toBeNull();
    expect(document.body).not.toHaveTextContent(/HH-\d{6}/);
  });

  it("a 409 expired is a plain error, not an end of names", async () => {
    open(GRACE);
    vi.spyOn(holder.client, "listNamedPatients").mockRejectedValueOnce(
      new ApiError(409, "expired"),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Show names" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Show names" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Audit" }));
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Show names" }),
    );
    expect(
      await screen.findByText("Couldn't load named patients"),
    ).toBeVisible();
    expect(screen.queryByText("Named access has ended")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("table", { name: /^Named patients/ }),
    ).toBeVisible();
  });

  it("the switch turned off drops the names with Named access was switched off.", async () => {
    const user = fakeClock();
    open(GRACE);
    await showNames("Clinical follow-up", undefined, user);
    // The server's switch goes to Off.
    holder.client = analysisAs(GRACE, admin, "off");
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await ended("Named access was switched off.");
  });

  it("changing a filter returns to de-identified, and Show names asks for the purpose again", async () => {
    const view = open(GRACE);
    await showNames();
    const listNamed = vi.spyOn(holder.client, "listNamedPatients");
    view.rerender(panel({ ...NAMED_FILTERS, from: "2025-11-01" }));
    await ended("Showing names again starts a new recorded view.");
    // Nothing named was asked for with the new filters.
    expect(listNamed).not.toHaveBeenCalled();
    await userEvent.click(
      await screen.findByRole("button", { name: "Show names" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Show names" }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: "Clinical follow-up" }),
    ).not.toBeChecked();
  });

  it("removing Kemi's Analyst role in the staff panel ends her names within 30 seconds", async () => {
    // Through the admin client's updateStaff, the call the staff panel's
    // Save makes (that Save is tested with the staff panel, Task 6).
    const user = fakeClock();
    open(KEMI);
    await showNames("Audit", undefined, user);
    // What the staff panel's Save sends.
    const kemi = (await admin.listStaff()).find((s) => s.id === "s-kemi")!;
    await admin.updateStaff("s-kemi", {
      version: kemi.version,
      roles: ["clinician"],
    });
    await act(() => vi.advanceTimersByTimeAsync(30 * SECOND));
    await ended("Your role or account changed.");
  });

  it("sign-out removes the named query", async () => {
    function SignOut() {
      const { signOut } = useAuth();
      return (
        <button type="button" onClick={() => void signOut("manual")}>
          Sign out now
        </button>
      );
    }
    open(
      GRACE,
      <>
        {panel()}
        <SignOut />
      </>,
    );
    await showNames();
    expect(namedQueries()).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Sign out now" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("table", { name: /^Named patients/ }),
      ).toBeNull(),
    );
    expect(namedQueries()).toHaveLength(0);
    expect(cached()).not.toMatch(/HH-\d{6}/);
  });
});
