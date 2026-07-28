import type { Uri } from "vscode";
import { TourScope } from "../../domain/tour/TourScope";
import { ScopeUnavailableError } from "../../shared/errors/KonsteliaError";
import type { FileSystem } from "../filesystem/FileSystem";
import { BaseYamlTourStorageProvider } from "./BaseYamlTourStorageProvider";

export class WorkspaceTourStorageProvider extends BaseYamlTourStorageProvider {
  public readonly scope = TourScope.Workspace;

  public constructor(fileSystem: FileSystem, private readonly workspaceStorageUri: Uri | undefined) {
    super(fileSystem);
  }

  protected getToursDirectory(): Promise<Uri> {
    if (!this.workspaceStorageUri) {
      throw new ScopeUnavailableError("Workspace tour storage is unavailable. Open a workspace and try again.");
    }
    return Promise.resolve(this.fileSystem.joinPath(this.workspaceStorageUri, "tours"));
  }
}
