import type { Uri } from "vscode";
import { randomUUID } from "node:crypto";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourValidationIssue } from "../../domain/tour/TourValidation";
import { FileKind, type FileSystem } from "../filesystem/FileSystem";
import { findUniqueTourUri } from "./TourFilename";
import type {
  StoredTourFile,
  TourLocation,
  TourStorageProvider,
  TourSummary,
} from "./TourStorageProvider";
import {
  deserializeTour,
  serializeTour,
  TourDocumentValidationError,
} from "./TourYaml";

interface ScannedTourFile {
  readonly uri: Uri;
  readonly tour?: TourDocument;
  readonly issues: readonly TourValidationIssue[];
}

function locationOf(scope: TourScope, uri: Uri): TourLocation {
  const value = uri.toString();
  return { scope, uri: value, documentUri: value };
}

export abstract class BaseYamlTourStorageProvider implements TourStorageProvider {
  public abstract readonly scope: TourScope;

  protected constructor(protected readonly fileSystem: FileSystem) {}

  private writeQueue: Promise<void> = Promise.resolve();

  public saveTour(tour: TourDocument): Promise<TourLocation> {
    return this.runExclusive(async () => {
      const directory = await this.getToursDirectory();
      await this.fileSystem.createDirectory(directory);
      const uri = await findUniqueTourUri(this.fileSystem, directory, tour.id);
      // Refuse to overwrite: another window may have taken this name since it was chosen.
      await this.writeAtomically(directory, uri, serializeTour(tour), false);
      return locationOf(this.scope, uri);
    });
  }

  public updateTour(tour: TourDocument): Promise<TourLocation> {
    return this.runExclusive(async () => {
      const files = await this.scanFiles();
      const match = files.find((file) => file.tour?.id === tour.id);
      if (!match) {
        throw new Error(`Tour '${tour.id}' does not exist in ${this.scope} storage.`);
      }
      const directory = await this.getToursDirectory();
      await this.writeAtomically(directory, match.uri, serializeTour(tour), true);
      return locationOf(this.scope, match.uri);
    });
  }

  public renameTour(currentId: string, tour: TourDocument): Promise<TourLocation> {
    return this.runExclusive(async () => {
      const files = await this.scanFiles();
      const match = files.find((file) => file.tour?.id === currentId);
      if (!match) {
        throw new Error(`Tour '${currentId}' does not exist in ${this.scope} storage.`);
      }
      if (files.some((file) => file.tour?.id === tour.id && file.uri !== match.uri)) {
        throw new Error(`Tour id '${tour.id}' already exists in ${this.scope} storage.`);
      }
      const directory = await this.getToursDirectory();
      const uri = await findUniqueTourUri(this.fileSystem, directory, tour.id);
      // Write the new file first; a failure then leaves the original untouched.
      await this.writeAtomically(directory, uri, serializeTour(tour), false);
      await this.fileSystem.deleteFile(match.uri);
      return locationOf(this.scope, uri);
    });
  }

  public async loadTour(id: string): Promise<TourDocument | undefined> {
    const files = await this.scanTours();
    return files.find(({ tour }) => tour?.id === id)?.tour;
  }

  public async listTours(): Promise<TourSummary[]> {
    const files = await this.scanTours();
    return files
      .filter((file): file is StoredTourFile & { tour: TourDocument } => file.tour !== undefined)
      .map(({ tour, location }) => ({
        id: tour.id,
        title: tour.title,
        location,
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  public deleteTour(id: string): Promise<void> {
    return this.runExclusive(async () => {
      const files = await this.scanFiles();
      const match = files.find(({ tour }) => tour?.id === id);
      if (match) {
        await this.fileSystem.deleteFile(match.uri);
      }
    });
  }

  public async scanTours(): Promise<StoredTourFile[]> {
    const files = await this.scanFiles();
    return files.map(({ uri, tour, issues }) => ({
      location: locationOf(this.scope, uri),
      ...(tour ? { tour } : {}),
      issues,
    }));
  }

  /** The Uri-typed view the provider needs for writing; callers only ever see strings. */
  private async scanFiles(): Promise<ScannedTourFile[]> {
    const directory = await this.getToursDirectory();
    if (!(await this.fileSystem.exists(directory))) {
      return [];
    }
    const entries = await this.fileSystem.listDirectory(directory);
    const files: ScannedTourFile[] = [];
    for (const entry of entries) {
      if (entry.kind !== FileKind.File || !entry.name.endsWith(".tour.yaml")) {
        continue;
      }
      const uri = this.fileSystem.joinPath(directory, entry.name);
      try {
        files.push({ uri, tour: deserializeTour(await this.fileSystem.readFile(uri)), issues: [] });
      } catch (error) {
        const issues =
          error instanceof TourDocumentValidationError
            ? error.issues
            : [{ path: "$", message: error instanceof Error ? error.message : "Invalid YAML." }];
        files.push({ uri, issues });
      }
    }
    return files;
  }

  protected abstract getToursDirectory(): Promise<Uri>;

  /** Writes through a temporary file so a failed write cannot leave a half-written tour. */
  private async writeAtomically(
    directory: Uri,
    target: Uri,
    content: Uint8Array,
    overwrite: boolean,
  ): Promise<void> {
    const temporary = this.fileSystem.joinPath(directory, `.tour.${randomUUID()}.tmp`);
    try {
      await this.fileSystem.writeFile(temporary, content);
      await this.fileSystem.renameFile(temporary, target, overwrite);
    } catch (error) {
      try {
        if (await this.fileSystem.exists(temporary)) {
          await this.fileSystem.deleteFile(temporary);
        }
      } catch {
        // Preserve the original write error.
      }
      throw error;
    }
  }

  /** Serializes writes the way the anchor registry does, so two saves cannot interleave. */
  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.writeQueue.then(operation, operation);
    this.writeQueue = current.then(() => undefined, () => undefined);
    return current;
  }
}
