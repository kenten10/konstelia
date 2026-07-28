import type { Uri } from "vscode";
import { TourScope } from "../../domain/tour/TourScope";
import type { FileSystem } from "../filesystem/FileSystem";
import { BaseYamlTourStorageProvider } from "./BaseYamlTourStorageProvider";

export class PersonalTourStorageProvider extends BaseYamlTourStorageProvider {
  public readonly scope = TourScope.Personal;

  public constructor(fileSystem: FileSystem, private readonly globalStorageUri: Uri) {
    super(fileSystem);
  }

  protected getToursDirectory(): Promise<Uri> {
    return Promise.resolve(this.fileSystem.joinPath(this.globalStorageUri, "tours"));
  }
}
