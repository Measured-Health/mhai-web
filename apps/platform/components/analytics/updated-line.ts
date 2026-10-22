/** "Updated 14:32": the server's time for that area, in the viewer's clock. */
export function updatedLine(iso: string) {
  const t = new Date(iso);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `Updated ${hh}:${mm}`;
}
