import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { Hospital, PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { HospitalHoldsSection } from "./hospital-holds-section";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/hospitals/h_harbour",
  useRouter: () => ({ push, replace: vi.fn() }),
}));

let api: PlatformClient;
beforeEach(() => {
  push.mockReset();
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => __resetPlatformClientForTests());

const get = (id: string) => api.getHospital(id);
const section = () => screen.getByRole("region", { name: "Legal holds" });

describe("the hospital's legal holds", () => {
  it("Harbour View lists HC/2026/0412 as Active, linked", async () => {
    renderWithAuth(<HospitalHoldsSection hospital={await get("h_harbour")} />);
    const link = within(section()).getByRole("link", {
      name: /HC\/2026\/0412/,
    });
    expect(link).toHaveAttribute("href", "/legal-holds/hold_hv");
    expect(link).toHaveTextContent("All records");
    expect(link).toHaveTextContent("Active");
  });

  it("a hospital with none reads No legal holds", async () => {
    renderWithAuth(
      <HospitalHoldsSection hospital={await get("h_westfield")} />,
    );
    expect(within(section()).getByText("No legal holds")).toBeInTheDocument();
  });

  it("Place a hold opens with the hospital filled in and goes to the new hold", async () => {
    renderWithAuth(<HospitalHoldsSection hospital={await get("h_havana")} />);
    await userEvent.click(
      within(section()).getByRole("button", { name: "Place a hold" }),
    );
    const d = screen.getByRole("dialog", { name: "Place a legal hold" });
    expect(within(d).getByText("Havana Hospital")).toBeInTheDocument();
    await userEvent.click(within(d).getByLabelText("Complaint"));
    await userEvent.type(within(d).getByLabelText(/^Reference/), "CMP-77");
    await userEvent.type(within(d).getByLabelText(/^Asked for by/), "Legal");
    await userEvent.click(within(d).getByRole("button", { name: "Continue" }));
    const s = await screen.findByRole("dialog", {
      name: "Place a legal hold on Havana Hospital?",
    });
    await userEvent.click(within(s).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(MOCK_CODE);
    await userEvent.click(
      within(s).getByRole("button", { name: "Place hold" }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    expect(push.mock.calls[0]![0]).toMatch(/^\/legal-holds\/hold_/);
  });

  it("a removed hospital offers no Place a hold", async () => {
    const h: Hospital = { ...(await get("h_havana")), status: "removed" };
    renderWithAuth(<HospitalHoldsSection hospital={h} />);
    expect(
      within(section()).queryByRole("button", { name: "Place a hold" }),
    ).toBeNull();
  });

  it("an auditor sees the holds and no button", async () => {
    renderWithAuth(<HospitalHoldsSection hospital={await get("h_harbour")} />, {
      user: AMARA,
    });
    expect(
      within(section()).getByRole("link", { name: /HC\/2026\/0412/ }),
    ).toBeInTheDocument();
    expect(within(section()).queryByRole("button")).toBeNull();
  });
});
