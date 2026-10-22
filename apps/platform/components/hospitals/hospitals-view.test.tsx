import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { AMARA, ADA, renderWithAuth } from "@/tests/render";
import { HospitalsView } from "./hospitals-view";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function install(email: string = ADA.email) {
  const api = createMockPlatform({
    delayMs: 0,
    me: () => email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
  return api;
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
});

const NAMES = [
  "Havana Hospital",
  "Northgate General Hospital",
  "Riverside Children's Hospital",
  "Eastbrook Medical Centre",
  "Westfield Clinic",
  "Harbour View Hospital",
  "Southpoint Hospital",
];

describe("the hospitals list", () => {
  it("lists the seven sample hospitals with status words and icons", async () => {
    renderWithAuth(<HospitalsView />);
    const table = await screen.findByRole("table");
    for (const h of [
      "Name",
      "Status",
      "Staff",
      "SSO",
      "Created",
      "Last activity",
    ])
      expect(
        within(table).getByRole("columnheader", { name: h }),
      ).toBeInTheDocument();
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(7);
    for (const n of NAMES)
      expect(within(table).getByRole("link", { name: n })).toBeInTheDocument();
    const north = within(table).getByRole("row", { name: /Northgate/ });
    const chip = within(north).getByText("Active");
    expect(chip.querySelector("svg")).not.toBeNull();
    for (const w of ["Set-up incomplete", "Deactivated", "Removal pending"]) {
      const el = within(table).getAllByText(w)[0]!;
      expect(el.querySelector("svg")).not.toBeNull();
    }
    expect(within(north).getByText(/^(On|Off)$/)).toBeInTheDocument();
  });

  it("search by short code finds the hospital", async () => {
    const api = install();
    const first = (await api.listHospitals({})).hospitals[4]!;
    renderWithAuth(<HospitalsView />);
    await screen.findByRole("table");
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search hospitals" }),
      first.short_code.toLowerCase(),
    );
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(1),
    );
    expect(screen.getByRole("link", { name: first.name })).toBeInTheDocument();
  });

  it("status filter shows only deactivated", async () => {
    renderWithAuth(<HospitalsView />);
    await screen.findByRole("table");
    const sel = screen.getByRole("combobox", { name: "Status" });
    expect(
      within(sel)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "All",
      "Active",
      "Set-up incomplete",
      "Deactivated",
      "Removal pending",
      "Removal scheduled",
      "Removed",
    ]);
    await userEvent.selectOptions(sel, "Deactivated");
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(1),
    );
    expect(
      screen.getByRole("link", { name: "Westfield Clinic" }),
    ).toBeInTheDocument();
  });

  it("filtering keeps the list on screen instead of the loading state", async () => {
    renderWithAuth(<HospitalsView />);
    await screen.findByRole("table");
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Status" }),
      "Deactivated",
    );
    expect(
      screen.queryByRole("status", { name: "Loading hospitals" }),
    ).toBeNull();
    expect(screen.getByRole("table")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("row").slice(1)).toHaveLength(1),
    );
  });

  it("shows No hospitals match with Clear", async () => {
    renderWithAuth(<HospitalsView />);
    await screen.findByRole("table");
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search hospitals" }),
      "zzzz",
    );
    expect(await screen.findByText("No hospitals match")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("an admin sees Add hospital; an auditor does not", async () => {
    const { unmount } = renderWithAuth(<HospitalsView />);
    await screen.findByRole("table");
    expect(screen.getByRole("link", { name: "Add hospital" })).toHaveAttribute(
      "href",
      "/hospitals/new",
    );
    unmount();
    install(AMARA.email);
    renderWithAuth(<HospitalsView />, { user: AMARA });
    await screen.findByRole("table");
    expect(screen.queryByText("Add hospital")).toBeNull();
  });

  it("Couldn't load shows Try again, which refetches", async () => {
    const api = install();
    const real = api.listHospitals.bind(api);
    const spy = vi
      .spyOn(api, "listHospitals")
      .mockRejectedValueOnce(new ApiError(503, "unavailable"))
      .mockImplementation(real);
    renderWithAuth(<HospitalsView />);
    expect(
      await screen.findByText("Couldn't load hospitals."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("phone width renders cards", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderWithAuth(<HospitalsView />);
    const list = await screen.findByRole("list", { name: "Hospitals" });
    expect(screen.queryByRole("table")).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(
      within(list).getByRole("link", { name: /^Northgate General Hospital/ }),
    ).toBeInTheDocument();
  });

  it("Add is disabled offline with the reason", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(<HospitalsView />);
    await screen.findByRole("table");
    const add = screen.getByRole("button", { name: "Add hospital" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(
      "You're offline. Reconnect to add a hospital.",
    );
    expect(screen.queryByRole("link", { name: "Add hospital" })).toBeNull();
    vi.restoreAllMocks();
  });
});
