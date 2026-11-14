import type { ReactElement } from "react";
import { ToastProvider } from "@mhai/ui/toast";
import { DEMO_EMAILS } from "@/lib/auth/mock";
import type { User } from "@/lib/auth/types";
import { renderWithAuth, TEST_USER } from "./auth-wrapper";

export const DIRECTOR: User = {
  ...TEST_USER,
  username: "director.obi",
  email: DEMO_EMAILS.director,
  displayName: "Dr. Obi",
  fullName: "Dr. Ngozi Obi",
  roleTitle: "Medical director",
  specialty: "Emergency medicine",
  roles: ["clinician", "hospital_admin"],
};

export const HOSPITAL_ADMIN: User = {
  ...TEST_USER,
  username: "admin.nwosu",
  email: DEMO_EMAILS.hospitalAdmin,
  displayName: "Grace Nwosu",
  fullName: "Grace Nwosu",
  roleTitle: "Hospital IT lead",
  specialty: null,
  roles: ["hospital_admin"],
};

/** An admin screen with a signed-in admin, a fresh query cache and toasts. */
export const renderAdmin = (ui: ReactElement, user: User = DIRECTOR) =>
  renderWithAuth(<ToastProvider>{ui}</ToastProvider>, user);

/** Types a 6-digit step-up code into a dialog's code boxes (the sixth digit submits). */
export async function enterCode(dialog: HTMLElement, code: string) {
  const { within } = await import("@testing-library/react");
  const userEvent = (await import("@testing-library/user-event")).default;
  await userEvent.click(within(dialog).getByLabelText("Digit 1 of 6"));
  await userEvent.keyboard(code);
}
