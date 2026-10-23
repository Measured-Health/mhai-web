import { onlineManager } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { Hospital, PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { HospitalConnectionsSection } from "./hospital-connections-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
beforeEach(() => {
  api = createMockPlatform({
    delayMs: 0,
    me: () => ADA.email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
afterEach(() => {
  onlineManager.setOnline(true);
  __resetPlatformClientForTests();
});

const show = async (id: string, user = ADA, over?: Partial<Hospital>) => {
  const h = { ...(await api.getHospital(id)), ...over };
  return renderWithAuth(<HospitalConnectionsSection hospital={h} />, { user });
};

describe("a hospital's record connections", () => {
  it("Havana's page lists Main record and Results system", async () => {
    await show("h_havana");
    const list = await screen.findByRole("list", {
      name: "Patient record connections",
    });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const main = within(list).getByRole("link", { name: /Main record/ });
    expect(main).toHaveAttribute("href", "/connections/emr_hv1");
    expect(main).toHaveTextContent("FHIR R4 server");
    expect(main).toHaveTextContent("Connected");
    expect(main).toHaveTextContent(/Last update/);
    expect(
      within(list).getByRole("link", { name: /Results system/ }),
    ).toHaveAttribute("href", "/connections/emr_hv2");
    expect(
      screen.getByRole("heading", { name: "Patient record connections" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add a connection" }),
    ).toHaveAttribute("href", "/connections/new?hospital=h_havana");
  });

  it("offline it says so instead of loading forever", async () => {
    onlineManager.setOnline(false);
    await show("h_havana");
    expect(
      await screen.findByText("You're offline. This needs a connection."),
    ).toBeVisible();
    expect(
      screen.queryByRole("status", {
        name: "Loading patient record connections",
      }),
    ).toBeNull();
  });

  it("Eastbrook reads Not connected", async () => {
    await show("h_eastbrook");
    expect(
      await screen.findByText(
        "Not connected. MHAI can't raise patient alerts for this hospital yet.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Add a connection" }),
    ).toHaveAttribute("href", "/connections/new?hospital=h_eastbrook");
  });

  it("an auditor sees no Add", async () => {
    await show("h_eastbrook", AMARA);
    await screen.findByText(/^Not connected\./);
    expect(screen.queryByRole("link", { name: "Add a connection" })).toBeNull();
  });

  it("a removed hospital shows its rows read-only and no Add", async () => {
    await show("h_havana", ADA, { status: "removed" });
    await screen.findByRole("link", { name: /Main record/ });
    expect(screen.queryByRole("link", { name: "Add a connection" })).toBeNull();
  });
});
