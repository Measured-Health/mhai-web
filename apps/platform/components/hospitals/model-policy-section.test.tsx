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
import { createStepUp, MOCK_CODE } from "@/lib/api/step-up";
import { ADA, AMARA, renderWithAuth } from "@/tests/render";
import {
  MASKED_NOTE,
  ModelPolicySection,
  NOT_ENABLED,
} from "./model-policy-section";

vi.mock("next/navigation", () => ({
  usePathname: () => "/hospitals/h_havana",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

let api: PlatformClient;
let who: string;
beforeEach(() => {
  who = ADA.email;
  api = createMockPlatform({
    delayMs: 0,
    me: () => who,
    stepUp: createStepUp(),
  });
  __setPlatformClientForTests(api);
});
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
  renderWithAuth(<ModelPolicySection hospital={h} />, { user, queryClient });
  return screen.findByRole("region", { name: "AI model" });
}
const term = (r: HTMLElement, name: string) =>
  within(r).getByText(name, { selector: "dt" }).nextElementSibling!;
async function typeCode(d: HTMLElement, code = MOCK_CODE) {
  await userEvent.click(within(d).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
const change = async (r: HTMLElement) =>
  userEvent.click(await within(r).findByRole("button", { name: "Change" }));
const saveForm = (r: HTMLElement) =>
  userEvent.click(within(r).getByRole("button", { name: "Save" }));
const dialog = () =>
  screen.findByRole("dialog", { name: "Change the AI model?" });

describe("a hospital's AI model", () => {
  it("shows Havana on Anthropic, its reference, limit and this month's use", async () => {
    const r = await show("h_havana");
    expect(await within(r).findByText("Anthropic (cloud)")).toBeVisible();
    expect(term(r, "Agreement reference")).toHaveTextContent("DEMO-SYNTHETIC");
    expect(term(r, "Monthly limit")).toHaveTextContent("2,000,000 tokens");
    const used = within(r).getByText(/^Used in /, { selector: "dt" });
    expect(used.nextElementSibling).toHaveTextContent(
      "1,240,000 tokens (62% of the limit)",
    );
    expect(used.nextElementSibling).toHaveTextContent(
      "12,000 held for answers in progress",
    );
    expect(
      within(r).getByText(new RegExp(MASKED_NOTE.slice(0, 30))),
    ).toBeVisible();
    expect(within(r).queryByText("Near this month's limit")).toBeNull();
  });

  it("warns at 80% of the limit", async () => {
    const r = await show("h_riverside");
    expect(await within(r).findByText("Near this month's limit")).toBeVisible();
  });

  it("a hospital with no policy is on MHAI's own model, never changed", async () => {
    const r = await show("h_northgate");
    expect(await within(r).findByText("MHAI's own model")).toBeVisible();
    expect(within(r).queryByText("Agreement reference")).toBeNull();
    expect(term(r, "Last changed")).toHaveTextContent("Never");
  });

  it("never shows Gemini as off: cloud_provider is null, provider_code says gemini", async () => {
    const policy = await api.getModelPolicy("h_lakeside");
    expect(policy).toMatchObject({
      cloud_provider: null,
      provider_code: "gemini",
    });
    const r = await show("h_lakeside");
    expect(await within(r).findByText("Google Gemini (cloud)")).toBeVisible();
    expect(within(r).queryByText("MHAI's own model")).toBeNull();
    expect(term(r, "Agreement reference")).toHaveTextContent("DPA-2026-0107");
    expect(
      within(r).getByText(new RegExp(MASKED_NOTE.slice(0, 30))),
    ).toBeVisible();
    // The form opens on Gemini, never on off.
    await change(r);
    expect(within(r).getByLabelText("Google Gemini (cloud)")).toBeChecked();
    expect(within(r).getByLabelText(/^MHAI's own model/)).not.toBeChecked();
    expect(within(r).getByLabelText("Agreement reference")).toHaveValue(
      "DPA-2026-0107",
    );
  });

  it("a provider code added later is shown as it is, never as off, and offered as it is", async () => {
    vi.spyOn(api, "getModelPolicy").mockResolvedValue({
      ...(await api.getModelPolicy("h_lakeside")),
      cloud_provider: null,
      provider_code: "mistral",
    });
    const spy = vi.spyOn(api, "setModelPolicy");
    const r = await show("h_lakeside");
    expect(await within(r).findByText("mistral (cloud)")).toBeVisible();
    expect(within(r).queryByText("MHAI's own model")).toBeNull();
    await change(r);
    expect(within(r).getByLabelText("mistral (cloud)")).toBeChecked();
    // Unchanged: nothing is sent.
    await saveForm(r);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("switches Northgate to Google Gemini from the picker", async () => {
    const spy = vi.spyOn(api, "setModelPolicy");
    const r = await show("h_northgate");
    await change(r);
    await userEvent.click(within(r).getByLabelText("Google Gemini (cloud)"));
    await userEvent.type(
      within(r).getByLabelText("Agreement reference"),
      "DPA-2026-0107",
    );
    await saveForm(r);
    const d = await dialog();
    expect(d).toHaveTextContent(
      "Answers for Northgate General Hospital will be drafted by Google Gemini, a cloud provider, under DPA-2026-0107",
    );
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy.mock.calls[0]![1]).toMatchObject({
      cloud_provider: "gemini",
      agreement_ref: "DPA-2026-0107",
    });
    expect(await within(r).findByText("Google Gemini (cloud)")).toBeVisible();
  });

  it("an auditor sees it and no Change", async () => {
    who = AMARA.email;
    const r = await show("h_havana", AMARA);
    await within(r).findByText("Anthropic (cloud)");
    expect(within(r).queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("a removed hospital can't be changed", async () => {
    const r = await show("h_havana", ADA, { status: "removed" });
    await within(r).findByText("Anthropic (cloud)");
    expect(within(r).queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("switches Northgate on with the code, and the reference is tidied", async () => {
    const spy = vi.spyOn(api, "setModelPolicy");
    const r = await show("h_northgate");
    await change(r);
    await userEvent.click(within(r).getByLabelText("Anthropic (cloud)"));
    await userEvent.type(
      within(r).getByLabelText("Agreement reference"),
      " agr-2026-0042 ",
    );
    const limit = within(r).getByLabelText("Monthly limit (tokens)");
    await userEvent.clear(limit);
    await userEvent.type(limit, "500,000");
    await saveForm(r);
    const d = await dialog();
    // Its own form is never nested in the edit form: a nested submit would
    // load the page (and sign out).
    expect(d.parentElement?.closest("form")).toBeNull();
    expect(d).toHaveTextContent(
      "Answers for Northgate General Hospital will be drafted by Anthropic, a cloud provider, under AGR-2026-0042, up to 500,000 tokens a month.",
    );
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(spy).toHaveBeenCalledWith(
      "h_northgate",
      {
        cloud_provider: "anthropic",
        agreement_ref: "AGR-2026-0042",
        monthly_token_budget: 500_000,
        mfa_code: MOCK_CODE,
      },
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(await within(r).findByText("Anthropic (cloud)")).toBeVisible();
    expect(term(r, "Monthly limit")).toHaveTextContent("500,000 tokens");
  });

  it("switching off sends no reference, whatever was typed", async () => {
    const spy = vi.spyOn(api, "setModelPolicy");
    const r = await show("h_havana");
    await change(r);
    await userEvent.click(within(r).getByLabelText(/^MHAI's own model/));
    expect(within(r).queryByLabelText("Agreement reference")).toBeNull();
    await saveForm(r);
    const d = await dialog();
    expect(d).toHaveTextContent("Nothing leaves our servers.");
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await within(r).findByText("MHAI's own model");
    expect(spy.mock.calls[0]![1]).toMatchObject({
      cloud_provider: null,
      agreement_ref: null,
    });
  });

  it("a bad reference or limit is caught before any code is asked for", async () => {
    const spy = vi.spyOn(api, "setModelPolicy");
    const r = await show("h_northgate");
    await change(r);
    await userEvent.click(within(r).getByLabelText("OpenAI (cloud)"));
    await saveForm(r);
    const ref = within(r).getByLabelText("Agreement reference");
    expect(ref).toHaveAccessibleDescription(/Enter the agreement reference\./);
    expect(ref).toHaveFocus();
    await userEvent.type(ref, "Dr Obi said yes");
    const limit = within(r).getByLabelText("Monthly limit (tokens)");
    await userEvent.clear(limit);
    await userEvent.type(limit, "1.5");
    await saveForm(r);
    expect(ref).toHaveAccessibleDescription(
      /Use AGR-YYYY-NNNN, DPA-YYYY-NNNN or DEMO-SYNTHETIC\./,
    );
    expect(limit).toHaveAccessibleDescription(/Enter a whole number of tokens/);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("a provider the deployment hasn't enabled: the dialog closes and the provider says so", async () => {
    const r = await show("h_northgate");
    await change(r);
    await userEvent.click(within(r).getByLabelText("xAI (cloud)"));
    await userEvent.type(
      within(r).getByLabelText("Agreement reference"),
      "DPA-2026-07",
    );
    await saveForm(r);
    const d = await dialog();
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await within(r).findByText(NOT_ENABLED)).toBeVisible();
    expect(within(r).getByLabelText("xAI (cloud)")).toHaveFocus();
    expect((await api.getModelPolicy("h_northgate")).cloud_provider).toBeNull();
  });

  it("a wrong code stays in the dialog, cleared for another try", async () => {
    const r = await show("h_havana");
    await change(r);
    const limit = within(r).getByLabelText("Monthly limit (tokens)");
    await userEvent.clear(limit);
    await userEvent.type(limit, "3000000");
    await saveForm(r);
    const d = await dialog();
    await typeCode(d, "000000");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(
      await within(d).findByText("That code didn't work. Try again."),
    ).toBeVisible();
    expect(within(d).getByLabelText("Digit 1 of 6")).toHaveValue("");
  });

  it("core's 422 validation_failed closes the dialog and says to check the details", async () => {
    vi.spyOn(api, "setModelPolicy").mockRejectedValueOnce(
      new ApiError(422, "validation_failed"),
    );
    const r = await show("h_havana");
    await change(r);
    await userEvent.click(within(r).getByLabelText(/^MHAI's own model/));
    await saveForm(r);
    const d = await dialog();
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      await within(r).findByText("Check the details and try again."),
    ).toBeVisible();
    expect(within(r).getByText("Nothing was saved.")).toBeVisible();
  });

  it("the masking note claims only what the masker does", () => {
    expect(MASKED_NOTE).toBe(
      "Only masked text is sent: identifying patient details are masked where detected. Documents and images never leave.",
    );
    expect(MASKED_NOTE).not.toMatch(/removed/);
  });

  it("too many changes in a minute says to wait, in the dialog", async () => {
    vi.spyOn(api, "setModelPolicy").mockRejectedValueOnce(
      new ApiError(429, "rate_limited"),
    );
    const r = await show("h_havana");
    await change(r);
    await userEvent.click(within(r).getByLabelText(/^MHAI's own model/));
    await saveForm(r);
    const d = await dialog();
    await typeCode(d);
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(
      await within(d).findByText(
        "Too many changes in a minute. Wait a moment and try again.",
      ),
    ).toBeVisible();
  });

  it("the code doesn't linger in the mutation cache after an answer", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const r = await show("h_havana", ADA, {}, queryClient);
    await change(r);
    await userEvent.click(within(r).getByLabelText(/^MHAI's own model/));
    await saveForm(r);
    const d = await dialog();
    await typeCode(d, "246810");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await within(d).findByText("That code didn't work. Try again.");
    await waitFor(() =>
      expect(
        JSON.stringify(queryClient.getMutationCache().getAll()),
      ).not.toContain("246810"),
    );
  });

  it("unchanged, Save closes the form without asking for a code", async () => {
    const spy = vi.spyOn(api, "setModelPolicy");
    const r = await show("h_havana");
    await change(r);
    await saveForm(r);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      await within(r).findByRole("button", { name: "Change" }),
    ).toBeVisible();
    expect(spy).not.toHaveBeenCalled();
  });

  it("a reply it can't read says it couldn't load, never a guess", async () => {
    vi.spyOn(api, "getModelPolicy").mockRejectedValue(
      new ApiError(502, "bad_gateway"),
    );
    const r = await show("h_havana");
    expect(
      await within(r).findByText("Couldn't load the AI model."),
    ).toBeVisible();
  });
});
