import { dateLabel } from "@/lib/format";

// The date wording lives in lib/format so lib code can share it.
export { dateLabel };
export const activityLabel = (iso: string | null) =>
  iso ? dateLabel(iso) : "No activity yet";
