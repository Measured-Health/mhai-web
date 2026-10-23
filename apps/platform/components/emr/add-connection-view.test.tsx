import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import { createMockPlatform } from "@/lib/api/mock";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { AddConnectionView } from "./add-connection-view";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  search: "hospital=h_westfield",
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/connections/new",
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

let api: ReturnType<typeof createMockPlatform>;
function install(email: string = ADA.email) {
  api = createMockPlatform({
    delayMs: 0,
    me: () => email,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
}
beforeEach(() => {
  nav.push.mockReset();
  nav.search = "hospital=h_westfield";
  install();
});
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

const SECRET = "SECRET-shared-key-4k4k";
const type = (label: string, v: string) =>
  userEvent.type(screen.getByLabelText(label), v);

async function fill() {
  await userEvent.click(
    await screen.findByRole("radio", { name: /Results message feed/ }),
  );
  await type("Name the hospital sees", "Results system");
  await type("Base address", "https://records.westfield.example/results");
  await type("Sending system ID", "WESTFIELD_RES");
  await type("Shared key", SECRET);
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}
const dialog = () =>
  screen.getByRole("dialog", {
    name: "Add Results message feed for Westfield Clinic?",
  });
async function code(c: string) {
  const d = dialog();
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(c);
  await userEvent.click(
    within(d).getByRole("button", { name: "Add connection" }),
  );
}

describe("Add a connection", () => {
  it("shows the types as cards with their summaries", async () => {
    renderWithAuth(<AddConnectionView />);
    expect(
      await screen.findByRole("radio", { name: /FHIR R4 server/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reads records from a FHIR R4 server"),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("radio", { name: /FHIR R4 server/ }),
    );
    expect(
      screen.getByText(
        "Shown to the hospital's staff, for example Main record. Don't use a product name.",
      ),
    ).toBeVisible();
  });

  it("adds Westfield's second connection switched off and opens its page", async () => {
    const spy = vi.spyOn(api, "addConnection");
    renderWithAuth(<AddConnectionView />);
    await fill();
    expect(
      within(dialog()).getByText(
        "It will be saved switched off. Test it, then switch it on.",
      ),
    ).toBeVisible();
    await code(MOCK_CODE);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0]![0]).toBe("h_westfield");
    expect(spy.mock.calls[0]![1]).toMatchObject({
      type: "hl7v2_feed",
      source_label: "Results system",
      settings: { sender_id: "WESTFIELD_RES" },
      credentials: { shared_key: SECRET },
    });
    const made = (await api.listConnections({ hospital: "h_westfield" }))
      .connections;
    expect(made).toHaveLength(2);
    const added = made.find((c) => c.source_label === "Results system")!;
    expect(added.enabled).toBe(false);
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(`/connections/${added.id}`),
    );
    expect(
      (await screen.findAllByText("Connection added. Test it next."))[0],
    ).toBeVisible();
    expect(JSON.stringify(await api.getConnection(added.id))).not.toContain(
      SECRET,
    );
  });

  it("clears the typed secret after a successful save", async () => {
    renderWithAuth(<AddConnectionView />);
    await fill();
    expect(screen.getByLabelText("Shared key")).toHaveValue(SECRET);
    await code(MOCK_CODE);
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    expect(screen.getByLabelText("Shared key")).toHaveValue("");
    expect(document.body.innerHTML).not.toContain(SECRET);
  });

  it("a wrong code keeps the form and says That code didn't work. Try again.", async () => {
    renderWithAuth(<AddConnectionView />);
    await fill();
    await code("000000");
    expect(
      await screen.findByText("That code didn't work. Try again."),
    ).toBeVisible();
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Results system")).toBeInTheDocument();
    expect(screen.getByDisplayValue("WESTFIELD_RES")).toBeInTheDocument();
    expect(
      (await api.listConnections({ hospital: "h_westfield" })).connections,
    ).toHaveLength(1);
  });

  it("refuses an http address and asks for a type first", async () => {
    renderWithAuth(<AddConnectionView />);
    await screen.findByRole("radio", { name: /FHIR R4 server/ });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByText("Choose a connection type.")).toBeVisible();
    await userEvent.click(
      screen.getByRole("radio", { name: /FHIR R4 server/ }),
    );
    await type("Name the hospital sees", "Main record");
    await type("Base address", "http://records.westfield.example");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      screen.getByText("Use an address that starts with https://."),
    ).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("without a hospital it shows a picker of hospitals", async () => {
    nav.search = "";
    renderWithAuth(<AddConnectionView />);
    const link = await screen.findByRole("link", { name: "Westfield Clinic" });
    expect(link).toHaveAttribute(
      "href",
      "/connections/new?hospital=h_westfield",
    );
  });

  it("an auditor is told Your account can only view this.", async () => {
    install(AMARA.email);
    renderWithAuth(<AddConnectionView />, { user: AMARA });
    expect(
      await screen.findByText("Your account can only view this."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("link", { name: /Back/ })).toBeVisible();
  });
});
