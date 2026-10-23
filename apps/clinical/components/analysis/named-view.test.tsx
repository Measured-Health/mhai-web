import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, onlineManager } from "@tanstack/react-query";
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

async function ended(reason: string) {
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Named access has ended");
  expect(alert).toHaveTextContent(reason);
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
    expect(mark.textContent).toContain("Grace Nwosu · 09:05");
    // Repeated across the list.
    expect(
      within(mark).getAllByText("Grace Nwosu · 09:05").length,
    ).toBeGreaterThan(3);
  });

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
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Named access has ended");
    expect(alert).toHaveTextContent(
      "The clearance letter's end date has passed.",
    );
    expect(screen.queryByRole("table", { name: /^Named patients/ })).toBeNull();
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
