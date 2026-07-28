import type { Uri } from "vscode";
import { TourScope } from "../../domain/tour/TourScope";
import { ScopeUnavailableError } from "../../shared/errors/KonsteliaError";
import type { FileSystem } from "../filesystem/FileSystem";
import { BaseYamlTourAnchorRegistry } from "./BaseYamlTourAnchorRegistry";

export class WorkspaceTourAnchorRegistry extends BaseYamlTourAnchorRegistry {
  public readonly scope = TourScope.Workspace;

  public constructor(fileSystem: FileSystem, private readonly workspaceStorageUri: Uri | undefined) {
    super(fileSystem);
  }

  protected getRegistryDirectory(): Promise<Uri> {
    if (!this.workspaceStorageUri) {
      throw new ScopeUnavailableError("Workspace anchor storage is unavailable. Open a workspace and try again.");
    }
    return Promise.resolve(this.workspaceStorageUri);
  }
}
