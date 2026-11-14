import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@mhai/api-client/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformClientForTests,
  __setPlatformClientForTests,
} from "@/lib/api/client";
import type { Hospital, PlatformClient } from "@/lib/api/contract";
import { createMockPlatform } from "@/lib/api/mock";
import { DEMO_RULE_SET } from "@/lib/api/mock-emr-rule-set";
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import { NOT_READY, RuleSetSection, SHADOW_TEXT } from "./rule-set-section";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hospitals/h_havana",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
let who: string;
const start = (emrEnabled = true) => {
  who = ADA.email;
  api = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
    emrEnabled,
  });
  __setPlatformClientForTests(api);
};
beforeEach(() => start());
afterEach(() => {
  __resetPlatformClientForTests();
  vi.restoreAllMocks();
});

async function show(
  id: string,
  user = ADA,
  over: Partial<Hospital> = {},
  queryClient?: QueryClient,
) {
  const h = { ...(await api.getHospital(id)), ...over };
  renderWithAuth(<RuleSetSection hospital={h} />, { user, queryClient });
  return screen.findByRole("region", { name: "Patient alerts" });
}
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
const saveForm = (r: HTMLElement) =>
  userEvent.click(within(r).getByRole("button", { name: "Save" }));

/** Opens Northgate's form (shadow) and fills a rule set in. */
async function switchOnForm(understood = true) {
  const r = await show("h_northgate");
  await userEvent.click(
    await within(r).findByRole("button", { name: "Switch on alerts" }),
  );
  await userEvent.click(
    within(r).getByLabelText("On: send patient alerts to clinicians"),
  );
  await userEvent.type(
    within(r).getByLabelText("Rule set version"),
    DEMO_RULE_SET.version,
  );
  await userEvent.type(
    within(r).getByLabelText("Fingerprint (SHA-256)"),
    DEMO_RULE_SET.sha256.toUpperCase(),
  );
  if (understood) await userEvent.click(within(r).getByRole("checkbox"));
  return r;
}

describe("a hospital's patient alerts (EMR rule set)", () => {
  it("shadow says findings are stored for review and no alert is sent", async () => {
    const r = await show("h_northgate");
    expect(await within(r).findByText(SHADOW_TEXT)).toBeVisible();
  });

  it("on shows the rule set, its fingerprint, and that it sends alerts", async () => {
    const r = await show("h_havana");
    expect(
      await within(r).findByText(/MHAI sends patient alerts to .*clinicians/),
    ).toBeVisible();
    expect(within(r).getByText(DEMO_RULE_SET.version)).toBeVisible();
    expect(within(r).getByText(DEMO_RULE_SET.sha256)).toBeVisible();
  });

  it("an auditor sees it and can't switch it", async () => {
    who = AMARA.email;
    const r = await show("h_havana", AMARA);
    await within(r).findByText(DEMO_RULE_SET.version);
    expect(within(r).queryByRole("button")).toBeNull();
  });

  it("a removed hospital can't be switched", async () => {
    const r = await show("h_northgate", ADA, { status: "removed" });
    await within(r).findByText(SHADOW_TEXT);
    expect(within(r).queryByRole("button")).toBeNull();
  });

  it("switching on warns it sends alerts, asks for the confirmation, then the code", async () => {
    const spy = vi.spyOn(api, "setEmrRuleSet");
    const r = await switchOnForm(false);
    expect(
      within(r).getByText(/This sends patient alerts to .*clinicians/),
    ).toBeVisible();
    await saveForm(r);
    // No confirmation, no code asked for.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      within(r).getByText("Confirm that you understand this sends alerts."),
    ).toBeVisible();
    await userEvent.click(within(r).getByRole("checkbox"));
    await saveForm(r);
    const d = await screen.findByRole("dialog", {
      name: "Send patient alerts to clinicians?",
    });
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Send alerts" }),
    );
    expect(
      (await screen.findAllByText("Patient alerts switched on"))[0],
    ).toBeVisible();
    // The fingerprint is sent lower-case, with the code.
    expect(spy.mock.calls[0]![1]).toEqual({
      version: DEMO_RULE_SET.version,
      sha256: DEMO_RULE_SET.sha256,
      mfa_code: MOCK_CODE,
    });
  });

  it("a bad version or fingerprint is caught before any code is asked for", async () => {
    const r = await show("h_northgate");
    await userEvent.click(
      await within(r).findByRole("button", { name: "Switch on alerts" }),
    );
    await userEvent.click(
      within(r).getByLabelText("On: send patient alerts to clinicians"),
    );
    await userEvent.type(within(r).getByLabelText("Rule set version"), "V 1");
    await userEvent.type(
      within(r).getByLabelText("Fingerprint (SHA-256)"),
      "abc",
    );
    await userEvent.click(within(r).getByRole("checkbox"));
    await saveForm(r);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(r).getByLabelText("Rule set version")).toHaveFocus();
    expect(
      within(r).getByText("Enter the 64-character SHA-256 fingerprint."),
    ).toBeVisible();
  });

  it("switching off sends both nulls and says alerts stop", async () => {
    const spy = vi.spyOn(api, "setEmrRuleSet");
    const r = await show("h_havana");
    await userEvent.click(
      await within(r).findByRole("button", { name: "Change" }),
    );
    await userEvent.click(
      within(r).getByLabelText("Off: trial run, no alerts are sent"),
    );
    await saveForm(r);
    const d = await screen.findByRole("dialog", {
      name: "Stop sending patient alerts?",
    });
    expect(
      within(d).getByText(/stop getting new patient alerts/),
    ).toBeVisible();
    await typeCode(d);
    await userEvent.click(
      within(d).getByRole("button", { name: "Switch off alerts" }),
    );
    expect(
      (await screen.findAllByText("Patient alerts switched off"))[0],
    ).toBeVisible();
    expect(spy.mock.calls[0]![1]).toMatchObject({
      version: null,
      sha256: null,
    });
    expect(await within(r).findByText(SHADOW_TEXT)).toBeVisible();
  });

  // A 503 is retried twice (WRITE_RETRY) before it is shown.
  it(
    "with patient records off on the deployment it says so, and nothing was saved",
    { timeout: 20_000 },
    async () => {
      start(false);
      const r = await switchOnForm();
      await saveForm(r);
      const d = await screen.findByRole("dialog");
      await typeCode(d);
      await userEvent.click(
        within(d).getByRole("button", { name: "Send alerts" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
        timeout: 15_000,
      });
      expect(await within(r).findByText(NOT_READY)).toBeVisible();
      expect(within(r).getByText("Nothing was saved.")).toBeVisible();
    },
  );

  it("a wrong code stays in the dialog, and doesn't linger in the cache", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const h = await api.getHospital("h_northgate");
    renderWithAuth(<RuleSetSection hospital={h} />, { user: ADA, queryClient });
    const r = await screen.findByRole("region", { name: "Patient alerts" });
    await userEvent.click(
      await within(r).findByRole("button", { name: "Switch on alerts" }),
    );
    await userEvent.click(
      within(r).getByLabelText("On: send patient alerts to clinicians"),
    );
    await userEvent.type(
      within(r).getByLabelText("Rule set version"),
      DEMO_RULE_SET.version,
    );
    await userEvent.type(
      within(r).getByLabelText("Fingerprint (SHA-256)"),
      DEMO_RULE_SET.sha256,
    );
    await userEvent.click(within(r).getByRole("checkbox"));
    await saveForm(r);
    const d = await screen.findByRole("dialog");
    await typeCode(d, "246810");
    await userEvent.click(
      within(d).getByRole("button", { name: "Send alerts" }),
    );
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        JSON.stringify(queryClient.getMutationCache().getAll()),
      ).not.toContain("246810"),
    );
  });

  it("a reply it can't read says it couldn't load, never a guess", async () => {
    vi.spyOn(api, "getEmrRuleSet").mockRejectedValue(
      new ApiError(502, "bad_gateway"),
    );
    const r = await show("h_havana");
    expect(
      await within(r).findByText("Couldn't load patient alerts."),
    ).toBeVisible();
  });
});
