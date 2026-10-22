/** Exports stop at this many rows. */
export const CSV_MAX_ROWS = 10_000;

export type Cell = string | number | null;

// A spreadsheet runs a cell that starts with one of these (formula injection).
const RISKY = /^[=+\-@\t\r]/;

export function csvCell(v: Cell): string {
  if (v === null) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = RISKY.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 with a byte-order mark (Excel), CRLF lines (RFC 4180). */
export const toCsv = (header: string[], rows: Cell[][]) =>
  "\uFEFF" +
  [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") +
  "\r\n";

/** Hands the file to the browser's download. Nothing is stored (R10). */
export function downloadCsv(filename: string, csv: string): void {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // After the click has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
