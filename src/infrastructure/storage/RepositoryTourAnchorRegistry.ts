import type { Uri } from "vscode";
import { TourScope } from "../../domain/tour/TourScope";
import type { FileSystem } from "../filesystem/FileSystem";
import { BaseYamlTourAnchorRegistry } from "./BaseYamlTourAnchorRegistry";
import type { RepositoryRootLocator } from "./RepositoryRootLocator";

export class RepositoryTourAnchorRegistry extends BaseYamlTourAnchorRegistry {
  public readonly scope = TourScope.Repository;

  public constructor(fileSystem: FileSystem, private readonly rootLocator: RepositoryRootLocator) {
    super(fileSystem);
  }

  protected getRegistryDirectory(): Promise<Uri> {
    return Promise.resolve(this.fileSystem.joinPath(this.rootLocator.getRoot(), ".konstelia"));
  }
}
