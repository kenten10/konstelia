import type { Uri } from "vscode";
import { randomUUID } from "node:crypto";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
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

export abstract class BaseYamlTourStorageProvider implements TourStorageProvider {
  public abstract readonly scope: TourScope;

  protected constructor(protected readonly fileSystem: FileSystem) {}

  private writeQueue: Promise<void> = Promise.resolve();

  public saveTour(tour: TourDocument): Promise<TourLocation> {
    return this.runExclusive(async () => {
      const directory = await this.getToursDirectory();
      await this.fileSystem.createDirectory(directory);
      const uri = await findUniqueTourUri(this.fileSystem, directory, tour.id);
      await this.fileSystem.writeFile(uri, serializeTour(tour));
      return { scope: this.scope, uri, documentUri: uri };
    });
  }

  public updateTour(tour: TourDocument): Promise<TourLocation> {
    return this.runExclusive(async () => {
      const files = await this.scanTours();
      const match = files.find((file) => file.tour?.id === tour.id);
      if (!match) {
        throw new Error(`Tour '${tour.id}' does not exist in ${this.scope} storage.`);
      }
      const target = match.location.uri;
      const directory = await this.getToursDirectory();
      const temporary = this.fileSystem.joinPath(directory, `.tour.${randomUUID()}.tmp`);
      try {
        await this.fileSystem.writeFile(temporary, serializeTour(tour));
        await this.fileSystem.renameFile(temporary, target, true);
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
      return match.location;
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

  public async deleteTour(id: string): Promise<void> {
    const files = await this.scanTours();
    const match = files.find(({ tour }) => tour?.id === id);
    if (match) {
      await this.fileSystem.deleteFile(match.location.uri);
    }
  }

  public async scanTours(): Promise<StoredTourFile[]> {
    const directory = await this.getToursDirectory();
    if (!(await this.fileSystem.exists(directory))) {
      return [];
    }
    const entries = await this.fileSystem.listDirectory(directory);
    const files: StoredTourFile[] = [];
    for (const entry of entries) {
      if (entry.kind !== FileKind.File || !entry.name.endsWith(".tour.yaml")) {
        continue;
      }
      const uri = this.fileSystem.joinPath(directory, entry.name);
      const location = { scope: this.scope, uri, documentUri: uri };
      try {
        files.push({ location, tour: deserializeTour(await this.fileSystem.readFile(uri)), issues: [] });
      } catch (error) {
        const issues =
          error instanceof TourDocumentValidationError
            ? error.issues
            : [{ path: "$", message: error instanceof Error ? error.message : "Invalid YAML." }];
        files.push({ location, issues });
      }
    }
    return files;
  }

  protected abstract getToursDirectory(): Promise<Uri>;

  /** Serializes writes the way the anchor registry does, so two saves cannot interleave. */
  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.writeQueue.then(operation, operation);
    this.writeQueue = current.then(() => undefined, () => undefined);
    return current;
  }
}
