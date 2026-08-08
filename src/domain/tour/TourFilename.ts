/**
 * Reduces a title to the stem a tour id and file name are built from. This is a naming rule of
 * the tour model itself, so it holds wherever tours are created, including outside VS Code.
 */
export function toSafeFilenameStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "tour";
}
