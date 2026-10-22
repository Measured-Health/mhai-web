import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { HOLD_HINT } from "@/lib/holds/labels";
import { ADA, renderWithAuth } from "@/tests/render";
import { PlaceHoldDialog } from "./place-hold-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function install(
  over: Partial<PlatformClient> = {},
  opts: { removalStarted?: string[] } = {},
) {
  const m = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
    ...opts,
  });
  const c = { ...m, ...over } as PlatformClient;
  __setPlatformClientForTests(c);
  return { m, c };
}
beforeEach(() => install());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const HAVANA = { id: "h_havana", name: "Havana Hospital" };

function open(hospital = HAVANA, onPlaced = vi.fn(), onClose = vi.fn()) {
  renderWithAuth(
    <PlaceHoldDialog
      open
      hospital={hospital}
      onClose={onClose}
      onPlaced={onPlaced}
    />,
  );
  return { onPlaced, onClose };
}
const form = () => screen.getByRole("dialog", { name: "Place a legal hold" });

async function fill(d: HTMLElement) {
  await userEvent.click(within(d).getByLabelText("Complaint"));
  await userEvent.type(within(d).getByLabelText(/^Reference/), "CMP-9");
  await userEvent.type(
    within(d).getByLabelText(/^Asked for by/),
    "The complaints office",
  );
}
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}

describe("Place a hold: the form", () => {
  it("every free-text field shows the hint", () => {
    open();
    expect(within(form()).getAllByText(HOLD_HINT)).toHaveLength(3);
  });

  it("Continue with empty fields shows each message and sends nothing", async () => {
    const { c } = install();
    const spy = vi.spyOn(c, "placeHold");
    renderWithAuth(
      <PlaceHoldDialog open onClose={vi.fn()} onPlaced={vi.fn()} />,
    );
    const d = form();
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    for (const m of [
      "Choose a hospital.",
      "Choose a reason.",
      "Enter the reference.",
      "Enter who asked for it.",
    ])
      expect(within(d).getByText(m)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("dialog", { name: /Place a legal hold on/ }),
    ).toBeNull();
  });

  it("dates out of order show the range message", async () => {
    open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByLabelText("From – To"));
    await userEvent.type(within(d).getByLabelText("From"), "2025-06-30");
    await userEvent.type(within(d).getByLabelText(/^To/), "2025-01-01");
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    expect(
      within(d).getByText("The end date must be on or after the start date."),
    ).toBeInTheDocument();
  });

  it("the picker leaves out Removed hospitals", async () => {
    const m = install().m;
    install({
      listHospitals: async (q) => {
        const r = await m.listHospitals(q);
        return {
          ...r,
          hospitals: [
            ...r.hospitals,
            {
              ...r.hospitals[0]!,
              id: "h_gone",
              name: "Gone Hospital",
              short_code: "GON",
              status: "removed",
            },
          ],
        };
      },
    });
    renderWithAuth(
      <PlaceHoldDialog open onClose={vi.fn()} onPlaced={vi.fn()} />,
    );
    const list = await screen.findByRole("list", { name: "Hospitals" });
    expect(within(list).getByText("Havana Hospital")).toBeInTheDocument();
    expect(within(list).queryByText("Gone Hospital")).toBeNull();
  });

  it("searches by name and chooses a hospital", async () => {
    renderWithAuth(
      <PlaceHoldDialog open onClose={vi.fn()} onPlaced={vi.fn()} />,
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search hospitals" }),
      "northgate",
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Northgate General/ }),
    );
    expect(screen.getByText("Northgate General Hospital")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change" })).toBeInTheDocument();
  });
});

describe("Place a hold: confirming", () => {
  it("asks for the code and places the hold, then onPlaced", async () => {
    const { c } = install();
    const spy = vi.spyOn(c, "placeHold");
    const { onPlaced, onClose } = open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: "Place a legal hold on Havana Hospital?",
    });
    expect(within(s).getByText("All records.")).toBeInTheDocument();
    expect(
      within(s).getByText(
        "Records it covers are kept until the hold is lifted.",
      ),
    ).toBeInTheDocument();
    await typeCode(s);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    await waitFor(() => expect(onPlaced).toHaveBeenCalledTimes(1));
    expect(onPlaced.mock.calls[0]![0]).toMatchObject({
      hospital: HAVANA,
      reference: "CMP-9",
      reason: "complaint",
      status: "active",
    });
    expect(onClose).toHaveBeenCalled();
    expect(spy.mock.calls[0]![0]).toMatchObject({
      hospital_id: "h_havana",
      reason: "complaint",
      asked_by: "The complaints office",
      mfa_code: MOCK_CODE,
    });
    expect(spy.mock.calls[0]![0]).not.toHaveProperty("from");
  });

  it("a wrong code shows That code didn't work", async () => {
    open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s, "000000");
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await within(s).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
  });

  it("removal_started shows This hospital's removal has already started. Act outside the app now.", async () => {
    install({}, { removalStarted: ["h_havana"] });
    const { onPlaced } = open();
    const d = form();
    await fill(d);
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: /Place a legal hold on/,
    });
    await typeCode(s);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    expect(
      await screen.findByText(
        "This hospital's removal has already started. Act outside the app now.",
      ),
    ).toBeInTheDocument();
    // Back on the form; the code step is closed.
    expect(
      within(form()).getByRole("button", { name: "Continue" }),
    ).toBeVisible();
    expect(onPlaced).not.toHaveBeenCalled();
  });
});
