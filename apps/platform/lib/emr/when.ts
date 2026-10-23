import { dateLabel } from "@/lib/format";

/** In the viewer's own time zone: "20 Oct 2026, 10:42". */
export function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${dateLabel(iso)}, ${time}`;
}
