/**
 * Whether a modal <dialog> is open (other than `except`). A modal dialog owns
 * the keyboard; a non-modal open one does not. Engines without `:modal` are
 * treated as having none.
 */
export function modalDialogOpen(except?: Element | null): boolean {
  return [...document.querySelectorAll("dialog[open]")].some((d) => {
    if (d === except) return false;
    try {
      return d.matches(":modal");
    } catch {
      return false;
    }
  });
}
