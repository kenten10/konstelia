import type { TourSourceReader } from "../../application/tours/ListToursWithHealth";
import type { FileSystem } from "../filesystem/FileSystem";
import type { RepositoryRootLocator } from "./RepositoryRootLocator";
import { assertSafeTourSourcePath } from "../../domain/tour/TourSourcePath";

const decoder = new TextDecoder();

export class RootedTourSourceReader implements TourSourceReader {
  public constructor(
    private readonly fileSystem: FileSystem,
    private readonly rootLocator: RepositoryRootLocator,
  ) {}

  public async readSource(relativeFile: string): Promise<string> {
    assertSafeTourSourcePath(relativeFile);
    return decoder.decode(
      await this.fileSystem.readFile(
        this.fileSystem.joinPath(this.rootLocator.getRoot(), relativeFile),
      ),
    );
  }
}
