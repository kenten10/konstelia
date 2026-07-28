import type { Uri } from "vscode";
import { TourScope } from "../../domain/tour/TourScope";
import type { FileSystem } from "../filesystem/FileSystem";
import { BaseYamlTourAnchorRegistry } from "./BaseYamlTourAnchorRegistry";

export class PersonalTourAnchorRegistry extends BaseYamlTourAnchorRegistry {
  public readonly scope = TourScope.Personal;

  public constructor(fileSystem: FileSystem, private readonly globalStorageUri: Uri) {
    super(fileSystem);
  }

  protected getRegistryDirectory(): Promise<Uri> {
    return Promise.resolve(this.globalStorageUri);
  }
}
