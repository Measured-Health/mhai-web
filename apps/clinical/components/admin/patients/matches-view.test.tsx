import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { createMockPatients } from "@/lib/api/mock-patients";
import type { PatientsClient } from "@/lib/api/patients-contract";
import { createStepUp, MOCK_CODE } from "@/lib/auth/mock";
import { FORBIDDEN_TERMS } from "@/lib/labels";
import { HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({
  client: null as unknown as PatientsClient,
}));
vi.mock("@/lib/api/patients", () => ({
  getPatientsClient: () => holder.client,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/patient-matches",
}));
import { MatchesView } from "./matches-view";

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  const step = createStepUp();
  holder.client = createMockPatients({
    delayMs: 0,
    stepUp: () => step,
    me: async () => HOSPITAL_ADMIN.email,
  });
});

const show = () => renderAdmin(<MatchesView />, HOSPITAL_ADMIN);
const firstCard = async () =>
  (await screen.findAllByRole("listitem")).find((li) =>
    within(li).queryByText("Same MRN, date of birth and sex"),
  )!;
const typeCode = async (dialog: HTMLElement, code = MOCK_CODE) => {
  await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
};

describe("MatchesView", () => {
  it("explains matches in plain words and shows both patients", async () => {
    show();
    const card = await firstCard();
    expect(
      screen.getByText(/Nothing is merged unless you confirm it/),
    ).toBeInTheDocument();
    expect(within(card).getByText("Patient A")).toBeInTheDocument();
    expect(within(card).getByText("Ama Synthetic-Owusu")).toBeInTheDocument();
    expect(within(card).getByText("Ama S. Owusu")).toBeInTheDocument();
    expect(
      screen.getByText("Same MRN, but other details differ or are missing"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A reviewed document links these two patients"),
    ).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    for (const t of FORBIDDEN_TERMS) expect(text).not.toContain(t);
    expect(text).not.toMatch(/mrn_only|document_link|mrn_birth_sex/);
  });

  it("merges into the patient you keep, with your code, and says what moves", async () => {
    show();
    const card = await firstCard();
    await userEvent.click(
      within(card).getByRole("button", { name: "Same patient: merge" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Merge these two patients?",
    });
    expect(
      within(dialog).getByText(/records, findings and alerts move to them/),
    ).toBeInTheDocument();
    // Nothing to confirm until a patient is chosen.
    expect(
      within(dialog).getByRole("button", { name: "Merge patients" }),
    ).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole("radio", { name: /Patient A/ }),
    );
    expect(
      within(dialog).getByText(
        "Ama S. Owusu's 7 records move to Ama Synthetic-Owusu.",
      ),
    ).toBeInTheDocument();
    await typeCode(dialog);
    expect(await screen.findByText("Patients merged")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Same MRN, date of birth and sex")).toBeNull(),
    );
  });

  it("a wrong code keeps the dialog open, clears the boxes, and the code is forgotten", async () => {
    let qc!: QueryClient;
    function Probe() {
      qc = useQueryClient();
      return null;
    }
    renderAdmin(
      <>
        <MatchesView />
        <Probe />
      </>,
      HOSPITAL_ADMIN,
    );
    const card = await firstCard();
    await userEvent.click(
      within(card).getByRole("button", { name: "Not the same patient" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: "Keep these as two patients?",
    });
    await typeCode(dialog, "000000");
    expect(
      await within(dialog).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveValue("");
    await waitFor(() =>
      expect(
        qc
          .getMutationCache()
          .getAll()
          .filter((m) =>
            /mfaCode|backupCode/.test(JSON.stringify(m.state.variables ?? {})),
          ),
      ).toEqual([]),
    );
    await typeCode(dialog);
    expect(await screen.findByText("Kept as two patients")).toBeInTheDocument();
  });

  it("a match decided elsewhere closes the dialog and says so", async () => {
    vi.spyOn(holder.client, "rejectMatch").mockRejectedValueOnce(
      new ApiError(404, "not_found"),
    );
    show();
    const card = await firstCard();
    await userEvent.click(
      within(card).getByRole("button", { name: "Not the same patient" }),
    );
    await typeCode(
      screen.getByRole("dialog", { name: "Keep these as two patients?" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("an empty list says nothing is waiting", async () => {
    vi.spyOn(holder.client, "listMatches").mockResolvedValue({ matches: [] });
    show();
    expect(
      await screen.findByText("No possible matches are waiting."),
    ).toBeInTheDocument();
  });

  it("a failed read offers Try again, never a code", async () => {
    vi.spyOn(holder.client, "listMatches").mockRejectedValue(
      new ApiError(502, "bad_gateway"),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    show();
    // A 5xx is retried with back-off (READ_RETRY): let the retries run out.
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(
      await screen.findByText("Couldn't load patient matches"),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("bad_gateway");
  });
});
