import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "@/lib/api/admin";
import type { ClearanceClient } from "@/lib/api/clearances";
import { resetClearances } from "@/lib/api/mock-clearances";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import { makeStaff, screenAdminAs } from "@/tests/admin";
import { renderAdmin } from "@/tests/admin-render";
import {
  dayAfter,
  fillUpload,
  sampleClients,
  uploadDialog,
} from "@/tests/clearances";

const holder = vi.hoisted(() => ({
  admin: null as unknown as AdminClient,
  clearances: null as unknown as ClearanceClient,
}));
vi.mock("@/lib/api/admin", () => ({ getAdminClient: () => holder.admin }));
vi.mock("@/lib/api/clearances", () => ({
  getClearanceClient: () => holder.clearances,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/admin/named-access",
}));
import { UploadDialog } from "./upload-dialog";

const onClose = vi.fn();
let t = "";
beforeEach(async () => {
  resetClearances();
  Object.assign(holder, sampleClients());
  onClose.mockReset();
  t = (await holder.clearances.listClearances()).today;
});
afterEach(() => vi.restoreAllMocks());

async function open(prefill?: Parameters<typeof UploadDialog>[0]["prefill"]) {
  renderAdmin(<UploadDialog open onClose={onClose} prefill={prefill} />);
  const dialog = await uploadDialog();
  // Ready once the people and the dates have loaded.
  await within(dialog).findByRole("checkbox", { name: "Dr. Ngozi Obi" });
  return dialog;
}
const uploadButton = (d: HTMLElement) =>
  within(d).getByRole("button", { name: "Upload" });

describe("UploadDialog", () => {
  it("upload: a text file is refused before sending with This file type isn't accepted", async () => {
    const send = vi.spyOn(holder.clearances, "uploadClearance");
    const dialog = await open();
    await userEvent.upload(
      within(dialog).getByLabelText("The letter"),
      new File(["hello, this is text"], "notes.pdf", {
        type: "application/pdf",
      }),
    );
    expect(
      await within(dialog).findByText("This file type isn't accepted"),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/^notes\.pdf · /)).toBeNull();
    await fillUpload(dialog, t, { file: false });
    expect(uploadButton(dialog)).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });

  it("upload: no preview is rendered (no img, iframe or object)", async () => {
    const dialog = await open();
    await userEvent.upload(
      within(dialog).getByLabelText("The letter"),
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0])], "letter.pdf"),
    );
    expect(await within(dialog).findByText("letter.pdf · 6 B")).toBeVisible();
    expect(document.querySelector("img, iframe, object, embed")).toBeNull();
  });

  it("the end date input's max is max_end_date; typing one day later shows the 12-month message", async () => {
    const { max_end_date } = await holder.clearances.listClearances();
    const dialog = await open();
    const end = within(dialog).getByLabelText("End date");
    expect(end).toHaveAttribute("max", max_end_date);
    expect(end).toHaveAttribute("min", dayAfter(t, 1));
    fireEvent.change(end, { target: { value: dayAfter(max_end_date, 1) } });
    expect(
      within(dialog).getByText(
        "The end date can't be more than 12 months away",
      ),
    ).toBeInTheDocument();
    fireEvent.change(end, { target: { value: max_end_date } });
    expect(
      within(dialog).queryByText(
        "The end date can't be more than 12 months away",
      ),
    ).toBeNull();
  });

  it("Upload stays disabled until confirm, a person, the dates and a full code", async () => {
    const dialog = await open();
    await fillUpload(dialog, t, { confirm: false, people: [], code: "12345" });
    expect(uploadButton(dialog)).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole("checkbox", {
        name: "This letter is signed by hospital leadership and names these people.",
      }),
    );
    expect(uploadButton(dialog)).toBeDisabled();
    await userEvent.click(
      within(dialog).getByRole("checkbox", { name: "Dr. Ngozi Obi" }),
    );
    expect(within(dialog).getByText("1 person picked")).toBeInTheDocument();
    expect(uploadButton(dialog)).toBeDisabled();
    // A letter date after the end date is not a date to send.
    fireEvent.change(within(dialog).getByLabelText("Letter date"), {
      target: { value: dayAfter(t, 1) },
    });
    await userEvent.click(within(dialog).getByLabelText("Digit 6 of 6"));
    await userEvent.keyboard("6");
    expect(uploadButton(dialog)).toBeDisabled();
    expect(
      within(dialog).getByText("The letter date can't be in the future"),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Letter date"), {
      target: { value: t },
    });
    expect(uploadButton(dialog)).toBeEnabled();
  });

  it("adding tunde.okafor@measured-health.example sends covered_platform; an unknown email shows the refusal with that email", async () => {
    const send = vi.spyOn(holder.clearances, "uploadClearance");
    const dialog = await open();
    await fillUpload(dialog, t);
    const email = within(dialog).getByLabelText(
      "Measured Health staff named in the letter (optional)",
    );
    await userEvent.type(email, "tunde.okafor@measured-health.example");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await userEvent.type(email, "nobody@measured-health.example");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(within(dialog).getByText("3 people in all")).toBeInTheDocument();
    await userEvent.click(uploadButton(dialog));
    expect(
      await within(dialog).findByText(
        "These aren't Measured Health platform admins with two-step: nobody@measured-health.example",
      ),
    ).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        covered: ["s-obi"],
        covered_platform: [
          "tunde.okafor@measured-health.example",
          "nobody@measured-health.example",
        ],
      }),
      expect.anything(),
    );
    // Take the unknown one out and send again: a fresh code is needed.
    await userEvent.click(
      within(dialog).getByRole("button", {
        name: "Remove nobody@measured-health.example",
      }),
    );
    await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
    await userEvent.keyboard("123456");
    await userEvent.click(uploadButton(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({
        covered_platform: ["tunde.okafor@measured-health.example"],
      }),
      expect.anything(),
    );
  });

  it("names a refused staff member through errorText", async () => {
    const { NotEligibleError } = await import("@mhai/api-client/errors");
    vi.spyOn(holder.clearances, "uploadClearance").mockRejectedValueOnce(
      new NotEligibleError("not_eligible", { ids: ["s-obi"] }),
    );
    const dialog = await open();
    await fillUpload(dialog, t);
    await userEvent.click(uploadButton(dialog));
    expect(
      await within(dialog).findByText(
        "Dr. Ngozi Obi can't be covered. Check the list and try again.",
      ),
    ).toBeInTheDocument();
  });

  it("19 staff plus 2 emails is refused before sending (20 at most)", async () => {
    const nineteen = Array.from({ length: 19 }, (_, i) =>
      makeStaff({
        id: `s-a${i}`,
        full_name: `Analyst ${i}`,
        display_name: `Analyst ${i}`,
        email: `a${i}@havanahospital.org`,
        roles: ["analyst"],
      }),
    );
    const admin = screenAdminAs(DEMO_EMAILS.director);
    vi.spyOn(admin, "listStaff").mockResolvedValue(nineteen);
    Object.assign(holder, sampleClients({ admin }));
    const send = vi.spyOn(holder.clearances, "uploadClearance");
    renderAdmin(
      <UploadDialog
        open
        onClose={onClose}
        prefill={{
          covered: nineteen.map((s) => s.id),
          signed_by: "Dr. Funmi Ade",
          signer_title: "Chief Medical Director",
          renews: "cl_soon",
        }}
      />,
    );
    const dialog = await uploadDialog();
    expect(
      await within(dialog).findByText("19 people picked"),
    ).toBeInTheDocument();
    await fillUpload(dialog, t, { people: [] });
    const email = within(dialog).getByLabelText(
      "Measured Health staff named in the letter (optional)",
    );
    await userEvent.type(email, "tunde.okafor@measured-health.example");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(uploadButton(dialog)).toBeEnabled();
    await userEvent.type(email, "ada.bakare@measured-health.example");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(within(dialog).getByText("21 people in all")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "A letter can cover 20 people at most. Remove some to continue.",
      ),
    ).toBeInTheDocument();
    expect(uploadButton(dialog)).toBeDisabled();
    fireEvent.submit(uploadButton(dialog).closest("form")!);
    expect(send).not.toHaveBeenCalled();
  });

  it("the picker greys out a clinician with Not an analyst or hospital admin, and someone without two-step with Two-step isn't on", async () => {
    const admin = screenAdminAs(DEMO_EMAILS.director);
    vi.spyOn(admin, "listStaff").mockResolvedValue([
      makeStaff({ id: "s-c", full_name: "Dr. Clin Ician" }),
      makeStaff({
        id: "s-n",
        full_name: "Ana Lyst",
        roles: ["analyst"],
        issues: ["mfa_not_set_up"],
      }),
      makeStaff({
        id: "s-ok",
        full_name: "Ok Admin",
        roles: ["hospital_admin"],
      }),
    ]);
    Object.assign(holder, sampleClients({ admin }));
    renderAdmin(<UploadDialog open onClose={onClose} />);
    const dialog = await uploadDialog();
    const clin = await within(dialog).findByRole("checkbox", {
      name: "Dr. Clin Ician",
    });
    expect(clin).toBeDisabled();
    expect(clin).toHaveAccessibleDescription(
      "Not an analyst or hospital admin",
    );
    const noTwoStep = within(dialog).getByRole("checkbox", {
      name: "Ana Lyst",
    });
    expect(noTwoStep).toBeDisabled();
    expect(noTwoStep).toHaveAccessibleDescription("Two-step isn't on");
    expect(
      within(dialog).getByRole("checkbox", { name: "Ok Admin" }),
    ).toBeEnabled();
  });

  it("a wrong code shows the two-step message and keeps the form", async () => {
    const dialog = await open();
    await fillUpload(dialog, t, { code: "000000" });
    await userEvent.click(uploadButton(dialog));
    expect(
      await within(dialog).findByText("That code didn't work. Try again."),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Signed by")).toHaveValue(
      "Dr. Funmi Ade",
    );
    expect(within(dialog).getByText(/^letter\.pdf · /)).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: "Dr. Ngozi Obi" }),
    ).toBeChecked();
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveValue("");
    expect(within(dialog).getByLabelText("Digit 1 of 6")).toHaveFocus();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sends renews from a prefill, and the server's refusal shows in words", async () => {
    const send = vi.spyOn(holder.clearances, "uploadClearance");
    const dialog = await open({
      covered: ["s-kemi"],
      signed_by: "Dr. Funmi Ade",
      signer_title: "Chief Medical Director",
      renews: "cl_soon",
    });
    expect(within(dialog).getByLabelText("Signed by")).toHaveValue(
      "Dr. Funmi Ade",
    );
    expect(
      within(dialog).getByRole("checkbox", { name: "Dr. Kemi Adeyemi" }),
    ).toBeChecked();
    // fillUpload types the signer again; clear the prefilled ones first.
    await userEvent.clear(within(dialog).getByLabelText("Signed by"));
    await userEvent.clear(within(dialog).getByLabelText("Job title"));
    await fillUpload(dialog, t, { people: [] });
    await userEvent.click(uploadButton(dialog));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ covered: ["s-kemi"], renews: "cl_soon" }),
      expect.anything(),
    );
  });

  it("offline disables Upload, with the reason", async () => {
    const dialog = await open();
    await fillUpload(dialog, t);
    expect(uploadButton(dialog)).toBeEnabled();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(uploadButton(dialog)).toBeDisabled();
    expect(
      within(dialog).getByText("You're offline. Uploading needs a connection."),
    ).toBeInTheDocument();
  });

  it("forgets the file when closed", async () => {
    function Host() {
      const [o, setO] = useState(true);
      return (
        <>
          <button onClick={() => setO(true)}>Open upload</button>
          <UploadDialog open={o} onClose={() => setO(false)} />
        </>
      );
    }
    renderAdmin(<Host />);
    const dialog = await uploadDialog();
    await userEvent.upload(
      within(dialog).getByLabelText("The letter"),
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "letter.pdf"),
    );
    await within(dialog).findByText(/^letter\.pdf · /);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(
      screen.queryByRole("dialog", { name: "Upload a letter" }),
    ).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Open upload" }));
    const again = await uploadDialog();
    expect(within(again).queryByText(/^letter\.pdf · /)).toBeNull();
    expect(within(again).getByLabelText("The letter")).toHaveValue("");
  });
});
