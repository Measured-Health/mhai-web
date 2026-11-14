import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPatients } from "@/lib/api/mock-patients";
import type { PatientsClient } from "@/lib/api/patients-contract";
import { createStepUp, MOCK_CODE } from "@/lib/auth/mock";
import { HOSPITAL_ADMIN, renderAdmin } from "@/tests/admin-render";

const holder = vi.hoisted(() => ({
  client: null as unknown as PatientsClient,
}));
vi.mock("@/lib/api/patients", () => ({
  getPatientsClient: () => holder.client,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/patient-exclusions",
}));
import { ExclusionResult, ExclusionView } from "./exclusion-view";

const start = (held = false) => {
  const step = createStepUp();
  holder.client = createMockPatients({
    delayMs: 0,
    held,
    stepUp: () => step,
    me: async () => HOSPITAL_ADMIN.email,
  });
};
beforeEach(() => start());

const fill = async (mrn: string) => {
  renderAdmin(<ExclusionView />, HOSPITAL_ADMIN);
  await userEvent.type(screen.getByLabelText("The patient's MRN"), mrn);
  await userEvent.click(
    screen.getByRole("radio", { name: "The patient objected" }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Exclude patient…" }),
  );
  return screen.getByRole("dialog", { name: "Exclude this patient?" });
};
const typeCode = async (dialog: HTMLElement) => {
  await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(MOCK_CODE);
};

describe("ExclusionView", () => {
  it("explains the purge, and the legal hold, before anything is done", () => {
    renderAdmin(<ExclusionView />, HOSPITAL_ADMIN);
    expect(
      screen.getByText(/the record data MHAI holds for them is deleted/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the deletion waits until the hold is lifted/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Exclude patient…" }),
    ).toBeDisabled();
  });

  it("excludes with your code and says the data was deleted; the MRN is cleared", async () => {
    const dialog = await fill("SYN-400512");
    expect(within(dialog).getByText(/withdrawn at once/)).toBeInTheDocument();
    await typeCode(dialog);
    expect(
      await screen.findByText("Patient excluded and their data deleted"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("The patient's MRN")).toHaveValue("");
    expect(document.body.textContent).not.toContain("SYN-400512");
  });

  it("under a legal hold says the data is kept until the hold is lifted", async () => {
    start(true);
    await typeCode(await fill("SYN-400512"));
    expect(
      await screen.findByText("Patient excluded. Their data is kept for now."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/deleted within 24 hours of that/),
    ).toBeInTheDocument();
  });

  it("an unknown MRN says no patient was found, and stays open", async () => {
    const dialog = await fill("SYN-NONE");
    await typeCode(dialog);
    expect(
      await within(dialog).findByText("No patient found"),
    ).toBeInTheDocument();
  });

  it("an MRN two patients share points to Patient matches", async () => {
    const dialog = await fill("SYN-100231");
    await typeCode(dialog);
    expect(
      await within(dialog).findByText("Two patients share this MRN"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/under Patient matches first/),
    ).toBeVisible();
    await waitFor(() => expect(screen.queryByText(/data deleted/)).toBeNull());
  });

  it("ExclusionResult reads purge_held", () => {
    render(
      <ExclusionResult
        r={{
          patient_id: "p",
          purge_by: "2026-11-14T09:00:00Z",
          purge_held: false,
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("has been deleted");
  });
});
