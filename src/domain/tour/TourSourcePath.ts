export function assertSafeTourSourcePath(file: string): void {
  if (!isSafeTourSourcePath(file)) {
    throw new Error(`Anchor source '${file}' must be a file inside the workspace root.`);
  }
}

export function isSafeTourSourcePath(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return !(
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  );
}
