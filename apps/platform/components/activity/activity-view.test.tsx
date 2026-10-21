import { QueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { HospitalIn, PlatformClient } from "@/lib/api/contract";
import { TEAM_EMAILS } from "@/lib/api/fixtures";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { renderWithAuth } from "@/tests/render";
import { ActivityView } from "./activity-view";

let search = "";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/activity",
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

function mock(over: Partial<PlatformClient> = {}) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => TEAM_EMAILS.ada,
    stepUp: createStepUp(),
  });
  const c = { ...m, ...over } as PlatformClient;
  __setPlatformClientForTests(c);
  return m;
}
const qc = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  search = "";
  replace.mockClear();
});
afterEach(() => {
  cleanup();
  __resetPlatformClientForTests();
});

const rows = () => within(screen.getByRole("list")).getAllByRole("listitem");

describe("Activity", () => {
  it("shows events newest first in plain words", async () => {
    mock();
    renderWithAuth(<ActivityView />);
    await screen.findByRole("list");
    const items = rows();
    expect(items).toHaveLength(12);
    expect(items[0].textContent).toMatch(
      /^Tunde .* requested removal · Southpoint Hospital · \d{2} \w{3} 2026, \d{2}:\d{2}/,
    );
    expect(items[2].textContent).toContain(
      "invited chiamaka.obi@eastbrook.example as first hospital admin · Eastbrook Medical Centre",
    );
    expect(items[6].textContent).toContain("invited ");
    expect(items[10].textContent).toContain("changed Amara Eze's role");
    expect(items[10].textContent).not.toContain("·  ·");
  });

  it("filters by hospital from the query string", async () => {
    mock();
    search = "hospital=h_northgate";
    renderWithAuth(<ActivityView />);
    await waitFor(() => expect(rows()).toHaveLength(2));
    for (const li of rows())
      expect(li.textContent).toContain("Northgate General Hospital");
    const select = screen.getByRole("combobox", { name: "Hospital" });
    await waitFor(() => expect(select).toHaveValue("h_northgate"));
  });

  it("choosing a hospital puts only its id in the URL", async () => {
    mock();
    renderWithAuth(<ActivityView />);
    const select = await screen.findByRole("combobox", { name: "Hospital" });
    await screen.findByRole("option", { name: "Westfield Clinic" });
    await userEvent.setup().selectOptions(select, "h_westfield");
    expect(replace).toHaveBeenCalledWith("/activity?hospital=h_westfield");
    await userEvent.setup().selectOptions(select, "");
    expect(replace).toHaveBeenLastCalledWith("/activity");
  });

  it("Load more appends the next page", async () => {
    const m = mock();
    const listActivity = vi.fn(
      async (q: { hospital?: string; cursor?: string }) => {
        const all = (await m.listActivity({})).events;
        return q.cursor
          ? { events: all.slice(5), next_cursor: null }
          : { events: all.slice(0, 5), next_cursor: "5" };
      },
    );
    mock({ listActivity });
    renderWithAuth(<ActivityView />);
    await screen.findByRole("list");
    expect(rows()).toHaveLength(5);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(rows()).toHaveLength(12));
    expect(listActivity).toHaveBeenLastCalledWith({ cursor: "5" });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("an action done in the app appears at the top after it", async () => {
    const m = mock();
    const client = qc();
    const first = renderWithAuth(<ActivityView />, { queryClient: client });
    await screen.findByRole("list");
    first.unmount();
    const body: HospitalIn = {
      name: "Lakeside Community Hospital",
      short_code: "lch",
      country: "NG",
      time_zone: "Africa/Lagos",
      email_domains: ["lakeside.example"],
      first_admin: { name: "Bola Ade", email: "bola.ade@lakeside.example" },
    };
    await m.addHospital(body, { idempotencyKey: "t14-1" });
    renderWithAuth(<ActivityView />, { queryClient: client });
    await waitFor(() => expect(rows()).toHaveLength(13));
    expect(rows()[0].textContent).toContain(
      "Ada Bakare added the hospital · Lakeside Community Hospital",
    );
  });

  it("says so when nothing matches", async () => {
    mock({ listActivity: async () => ({ events: [], next_cursor: null }) });
    renderWithAuth(<ActivityView />);
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
  });

  it("shows a loading state, then Couldn't load with Try again", async () => {
    let fail = true;
    mock({
      listActivity: async () => {
        if (fail) throw new Error("down");
        return { events: [], next_cursor: null };
      },
    });
    renderWithAuth(<ActivityView />);
    expect(
      screen.getByRole("status", { name: "Loading activity" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Couldn't load activity."),
    ).toBeInTheDocument();
    fail = false;
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
  });
});
