import { z } from "zod";

/** Page path with ids masked. Never form or result content. */
export function maskPage(page: string): string {
  const path = page.split(/[?#]/)[0] ?? "";
  return path.replace(/^\/(c|print)\/[^/]+/, "/$1/[id]") || "/";
}

/** "1280×800", or "" when it isn't a plain screen size. */
export const cleanViewport = (v: string) =>
  /^\d{2,5}×\d{2,5}$/.test(v) ? v : "";

/** What the demo's feedback form sends. Shared by the dialog and the route. */
export const FeedbackSchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters).")
    .max(2000, "Keep it under 2000 characters."),
  contact: z.string().trim().max(120, "Keep it under 120 characters."),
  page: z.string().max(200),
  viewport: z.string().max(20),
  // Spam trap: a hidden field people never fill in.
  website: z.string().max(0),
});
export type FeedbackInput = z.infer<typeof FeedbackSchema>;

export const FEEDBACK_EMAIL = "info.measuredhealth@gmail.com";
