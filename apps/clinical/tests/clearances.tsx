import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AdminClient } from "@/lib/api/admin";
import type { ClearanceClient } from "@/lib/api/clearances";
import { createMockClearances } from "@/lib/api/mock-clearances";
import { createStepUp, DEMO_EMAILS, MOCK_CODE } from "@/lib/auth/mock";
import { screenAdminAs } from "@/tests/admin";

/** The sample hospital's letters for a screen, on a clock the test can move. */
export function sampleClients(
  over: {
    now?: () => number;
    namedAccess?: "off" | "letters_only" | "on";
    admin?: AdminClient;
  } = {},
): { admin: AdminClient; clearances: ClearanceClient } {
  const admin = over.admin ?? screenAdminAs(DEMO_EMAILS.director);
  const now = over.now ?? (() => Date.now());
  return {
    admin,
    clearances: createMockClearances({
      now,
      me: async () => DEMO_EMAILS.director,
      delayMs: 0,
      stepUp: createStepUp(now),
      namedAccess: over.namedAccess ?? "on",
      staff: () => admin.listStaff(),
    }),
  };
}

export const PDF_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
export const pdf = (name = "letter.pdf") =>
  new File([new Uint8Array([...PDF_BYTES, 0, 0])], name, {
    type: "application/pdf",
  });

/** A day as `yyyy-mm-dd`, whole days on from `from`. */
export const dayAfter = (from: string, days: number) => {
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** Fills the upload form with good values, leaving out the named steps. */
export async function fillUpload(
  dialog: HTMLElement,
  today: string,
  {
    file = true,
    people = ["Dr. Ngozi Obi"],
    confirm = true,
    code = MOCK_CODE as string | null,
  } = {},
) {
  const w = within(dialog);
  if (file) {
    await userEvent.upload(w.getByLabelText("The letter"), pdf());
    await w.findByText(/^letter\.pdf · /);
  }
  await userEvent.type(w.getByLabelText("Signed by"), "Dr. Funmi Ade");
  await userEvent.type(w.getByLabelText("Job title"), "Chief Medical Director");
  fireEvent.change(w.getByLabelText("Letter date"), {
    target: { value: dayAfter(today, -2) },
  });
  fireEvent.change(w.getByLabelText("End date"), {
    target: { value: dayAfter(today, 90) },
  });
  for (const p of people)
    await userEvent.click(w.getByRole("checkbox", { name: p }));
  if (confirm)
    await userEvent.click(
      w.getByRole("checkbox", {
        name: "This letter is signed by hospital leadership and names these people.",
      }),
    );
  if (code !== null) {
    await userEvent.click(w.getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard(code);
  }
}

export const uploadDialog = () =>
  screen.findByRole("dialog", { name: "Upload a letter" });
