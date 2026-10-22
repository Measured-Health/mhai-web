import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@mhai/api-client/errors";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { HoldsView } from "./holds-view";

const push = vi.hoisted(() => ({ fn: (() => {}) as (to: string) => void }));
// A tiny URL: replace() changes the query and tells every reader.
const url = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set(s: string) {
      search = s;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/legal-holds",
  useRouter: () => ({
    push: (to: string) => push.fn(to),
    replace: (to: string) => url.set(to.split("?")[1] ?? ""),
  }),
  useSearchParams: () => {
    const s = useSyncExternalStore(url.subscribe, url.get, url.get);
    return new URLSearchParams(s);
  },
}));

function install(over: Partial<PlatformClient> = {}) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests({ ...m, ...over } as PlatformClient);
  return m;
}
beforeEach(() => {
  push.fn = () => {};
  url.set("");
  install();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const rowsOf = (t: HTMLElement) => within(t).getAllByRole("row").slice(1);
const hospitalsIn = (t: HTMLElement) =>
  rowsOf(t).map((r) => within(r).getAllByRole("link")[0]!.textContent);

describe("the legal holds list", () => {
  it("opens on Open: Harbour View, Northgate and Riverside, not Lakeside or Havana", async () => {
    renderWithAuth(<HoldsView />);
    const table = await screen.findByRole("table");
    for (const h of [
      "Hospital",
      "What it covers",
      "Reason",
      "Reference",
      "Placed",
      "Review date",
      "Status",
    ])
      expect(
        within(table).getByRole("columnheader", { name: h }),
      ).toBeInTheDocument();
    expect(hospitalsIn(table).sort()).toEqual([
      "Harbour View Hospital",
      "Northgate General Hospital",
      "Riverside Children's Hospital",
    ]);
    expect(
      within(table).getByRole("link", { name: "Harbour View Hospital" }),
    ).toHaveAttribute("href", "/legal-holds/hold_hv");
    expect(within(table).getAllByText("All records")).toHaveLength(2);
    expect(
      within(table).getByText("Records from 1 Jan 2025 to 30 Jun 2025"),
    ).toBeInTheDocument();
    expect(within(table).getByText("HC/2026/0412")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Legal holds",
    );
  });

  it("Lifted shows Lakeside's release line and Havana's 'Lifted by Ada Bakare'", async () => {
    renderWithAuth(<HoldsView />);
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "Lifted");
    await waitFor(() =>
      expect(screen.getByText(/^Lifted by Ada Bakare · /)).toBeInTheDocument(),
    );
    const table = screen.getByRole("table");
    expect(hospitalsIn(table).sort()).toEqual([
      "Havana Hospital",
      "Lakeside Community Clinic",
    ]);
    expect(
      within(table).getByText(/^Lifted · records released on \d+ \w+ \d{4}$/),
    ).toBeInTheDocument();
    expect(url.get()).toBe("status=lifted");
  });

  it("the hospital filter and reference search narrow the list and sit in the URL", async () => {
    renderWithAuth(<HoldsView />);
    await screen.findByRole("table");
    await userEvent.selectOptions(
      await screen.findByRole("combobox", { name: "Hospital" }),
      "Northgate General Hospital",
    );
    await waitFor(() =>
      expect(hospitalsIn(screen.getByRole("table"))).toEqual([
        "Northgate General Hospital",
      ]),
    );
    expect(url.get()).toBe("hospital=h_northgate");
    await userEvent.selectOptions(screen.getByLabelText("Hospital"), "");
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search by reference" }),
      "cmp-0",
    );
    await waitFor(() =>
      expect(hospitalsIn(screen.getByRole("table"))).toEqual([
        "Riverside Children's Hospital",
      ]),
    );
    expect(url.get()).toBe("q=cmp-0");
  });

  it("starts from a link's query", async () => {
    url.set("hospital=h_havana&status=all");
    renderWithAuth(<HoldsView />);
    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(hospitalsIn(table)).toEqual(["Havana Hospital"]),
    );
    expect(screen.getByLabelText("Status")).toHaveValue("all");
  });

  it("Review due shows the word and an icon", async () => {
    renderWithAuth(<HoldsView />);
    const table = await screen.findByRole("table");
    const word = within(table).getByText("Review due");
    expect(word.querySelector("svg")).not.toBeNull();
  });

  it("shows Place a hold to a platform admin and not to an auditor", async () => {
    renderWithAuth(<HoldsView />);
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "Place a hold" })).toBeEnabled();
  });

  it("an auditor sees no Place a hold", async () => {
    install();
    renderWithAuth(<HoldsView />, { user: AMARA });
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "Place a hold" })).toBeNull();
  });

  it("says Couldn't load legal holds with Try again", async () => {
    let down = true;
    const m = install();
    install({
      listHolds: (q) =>
        down ? Promise.reject(new ApiError(503, "x")) : m.listHolds(q),
    });
    down = true;
    renderWithAuth(<HoldsView />);
    expect(
      await screen.findByText("Couldn't load legal holds."),
    ).toBeInTheDocument();
    down = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("says No legal holds when none match", async () => {
    renderWithAuth(<HoldsView />);
    await screen.findByRole("table");
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search by reference" }),
      "zzz",
    );
    expect(await screen.findByText("No legal holds")).toBeInTheDocument();
  });

  it("offline disables Place a hold with the reason", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithAuth(<HoldsView />);
    await screen.findByRole("table");
    const btn = screen.getByRole("button", { name: "Place a hold" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAccessibleDescription(
      "You're offline. This needs a connection.",
    );
  });

  it("at phone width rows are cards", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    renderWithAuth(<HoldsView />);
    const list = await screen.findByRole("list", { name: "Legal holds" });
    expect(screen.queryByRole("table")).toBeNull();
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(list).getByRole("link", { name: "Harbour View Hospital" }),
    ).toHaveAttribute("href", "/legal-holds/hold_hv");
  });

  it("placing a hold opens the new hold's page", async () => {
    const go = vi.fn();
    push.fn = go;
    renderWithAuth(<HoldsView />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Place a hold" }));
    const d = screen.getByRole("dialog", { name: "Place a legal hold" });
    await userEvent.type(
      within(d).getByRole("searchbox", { name: "Search hospitals" }),
      "eastbrook",
    );
    await userEvent.click(
      await within(d).findByRole("button", { name: /Eastbrook/ }),
    );
    await userEvent.click(within(d).getByLabelText("Complaint"));
    await userEvent.type(within(d).getByLabelText(/^Reference/), "CMP-77");
    await userEvent.type(within(d).getByLabelText(/^Asked for by/), "Office");
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await userEvent.click(within(s).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    await waitFor(() => expect(go).toHaveBeenCalledTimes(1));
    expect(go.mock.calls[0]![0]).toMatch(/^\/legal-holds\/[A-Za-z0-9_-]+$/);
  });
});
