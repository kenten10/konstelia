import type { Uri } from "vscode";
import { toSafeFilenameStem } from "../../domain/tour/TourFilename";
import type { FileSystem } from "../filesystem/FileSystem";

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
