import type { Uri } from "vscode";
import { TourScope } from "../../domain/tour/TourScope";
import type { FileSystem } from "../filesystem/FileSystem";
import { BaseYamlTourStorageProvider } from "./BaseYamlTourStorageProvider";
import type { RepositoryRootLocator } from "./RepositoryRootLocator";

export class RepositoryTourStorageProvider extends BaseYamlTourStorageProvider {
  public readonly scope = TourScope.Repository;

  public constructor(fileSystem: FileSystem, private readonly rootLocator: RepositoryRootLocator) {
    super(fileSystem);
  }

  protected getToursDirectory(): Promise<Uri> {
    return Promise.resolve(this.fileSystem.joinPath(this.rootLocator.getRoot(), ".konstelia", "tours"));
  }
}
