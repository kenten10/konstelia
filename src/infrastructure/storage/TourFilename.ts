import type { Uri } from "vscode";
import type { FileSystem } from "../filesystem/FileSystem";

export function toSafeFilenameStem(value: string): string {
  const stem = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return stem || "tour";
}

export async function findUniqueTourUri(
  fileSystem: FileSystem,
  directory: Uri,
  preferredStem: string,
): Promise<Uri> {
  const stem = toSafeFilenameStem(preferredStem);
  let suffix = 1;
  while (true) {
    const numberedStem = suffix === 1 ? stem : `${stem}-${suffix}`;
    const candidate = fileSystem.joinPath(directory, `${numberedStem}.tour.yaml`);
    if (!(await fileSystem.exists(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
}
