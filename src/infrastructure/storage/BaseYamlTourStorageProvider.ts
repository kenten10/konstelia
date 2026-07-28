import type { Uri } from "vscode";
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

  public async saveTour(tour: TourDocument): Promise<TourLocation> {
    const directory = await this.getToursDirectory();
    await this.fileSystem.createDirectory(directory);
    const uri = await findUniqueTourUri(this.fileSystem, directory, tour.id);
    await this.fileSystem.writeFile(uri, serializeTour(tour));
    return { scope: this.scope, uri, documentUri: uri };
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

}
