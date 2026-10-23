import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { ConnectionsView } from "./connections-view";

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
  usePathname: () => "/connections",
  useRouter: () => ({
    push: vi.fn(),
    replace: (to: string) => url.set(to.split("?")[1] ?? ""),
  }),
  useSearchParams: () => {
    const s = useSyncExternalStore(url.subscribe, url.get, url.get);
    return new URLSearchParams(s);
  },
}));

beforeEach(() => {
  url.set("");
  __setPlatformClientForTests(
    createMockPlatform({
      delayMs: 0,
      me: () => ADA.email,
      stepUp: createStepUp(),
    }),
  );
});
afterEach(() => __resetPlatformClientForTests());

describe("the connections list", () => {
  it("lists Havana's two connections as Connected", async () => {
    renderWithAuth(<ConnectionsView />);
    const table = await screen.findByRole("table");
    for (const h of [
      "Hospital",
      "Name the hospital sees",
      "Type",
      "State",
      "Last update",
      "Problems (24 h)",
    ])
      expect(
        within(table).getByRole("columnheader", { name: h }),
      ).toBeInTheDocument();
    for (const [label, type, href] of [
      ["Main record", "FHIR R4 server", "/connections/emr_hv1"],
      ["Results system", "Results message feed", "/connections/emr_hv2"],
    ] as const) {
      const link = within(table)
        .getAllByRole("link", { name: label })
        .find((l) => l.getAttribute("href") === href)!;
      expect(link).toBeDefined();
      const row = link.closest("tr")!;
      expect(within(row).getByText("Havana Hospital")).toBeInTheDocument();
      expect(within(row).getByText(type)).toBeInTheDocument();
      const chip = within(row).getByText("Connected");
      expect(chip.querySelector("svg")).not.toBeNull();
    }
  });

  it("Needs attention shows only Northgate", async () => {
    renderWithAuth(<ConnectionsView />);
    await screen.findByRole("table");
    await userEvent.click(
      screen.getByRole("button", { name: /^Needs attention/ }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Havana Hospital")).toBeNull(),
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Northgate General Hospital");
    expect(rows[0]).toHaveTextContent("Needs attention");
    expect(url.get()).toBe("state=needs_attention");
  });

  it("each filter shows its count", async () => {
    renderWithAuth(<ConnectionsView />);
    await screen.findByRole("table");
    for (const re of [
      /^All\s*\d+$/,
      /^Needs attention\s*1$/,
      /^Switched off\s*\d+$/,
      /^Not connected\s*\d+$/,
    ])
      expect(screen.getByRole("button", { name: re })).toBeInTheDocument();
  });

  it("Not connected lists Eastbrook with Add a connection for admins only", async () => {
    url.set("state=not_connected");
    const { unmount } = renderWithAuth(<ConnectionsView />);
    const row = (await screen.findByText("Eastbrook Medical Centre")).closest(
      "tr",
    )!;
    expect(within(row).getByText("Not connected")).toBeInTheDocument();
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(
      within(row).getByRole("link", { name: "Add a connection" }),
    ).toHaveAttribute("href", "/connections/new?hospital=h_eastbrook");
    expect(screen.queryByText("Havana Hospital")).toBeNull();
    unmount();
    renderWithAuth(<ConnectionsView />, { user: AMARA });
    await screen.findByText("Eastbrook Medical Centre");
    expect(screen.queryByRole("link", { name: "Add a connection" })).toBeNull();
  });

  it("the filter is in the URL query and nothing is stored", async () => {
    url.set("state=off");
    renderWithAuth(<ConnectionsView />);
    await screen.findByRole("table");
    expect(
      screen.getByRole("button", { name: /^Switched off/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Havana Hospital")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(url.get()).toBe("");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("an unknown filter reads as All", async () => {
    url.set("state=bogus");
    renderWithAuth(<ConnectionsView />);
    expect(await screen.findAllByText("Havana Hospital")).toHaveLength(2);
    expect(screen.getByText("Eastbrook Medical Centre")).toBeInTheDocument();
  });
});
