const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
export const dateLabel = (iso: string) => DATE.format(new Date(iso));
export const activityLabel = (iso: string | null) =>
  iso ? dateLabel(iso) : "No activity yet";
