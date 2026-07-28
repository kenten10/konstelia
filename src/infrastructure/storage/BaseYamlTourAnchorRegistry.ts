import type { Uri } from "vscode";
import { randomUUID } from "node:crypto";
import type { TourAnchorRegistry } from "../../application/tours/TourAnchorRegistry";
import type { TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type { FileSystem } from "../filesystem/FileSystem";
import { deserializeAnchors, serializeAnchors } from "./AnchorYaml";

export abstract class BaseYamlTourAnchorRegistry implements TourAnchorRegistry {
  public abstract readonly scope: TourScope;

  protected constructor(protected readonly fileSystem: FileSystem) {}
  private writeQueue: Promise<void> = Promise.resolve();

  public async loadAnchors(): Promise<TourAnchor[]> {
    const uri = await this.getRegistryUri();
    if (!(await this.fileSystem.exists(uri))) {
      return [];
    }
    return deserializeAnchors(await this.fileSystem.readFile(uri));
  }

  public async saveAnchor(anchor: TourAnchor): Promise<void> {
    await this.runExclusive(async () => {
      const anchors = await this.loadAnchors();
      if (anchors.some((candidate) => candidate.id === anchor.id)) {
        throw new Error(`Anchor id '${anchor.id}' already exists in ${this.scope} storage.`);
      }
      await this.writeAnchors([...anchors, anchor]);
    });
  }

  public async replaceAnchor(anchor: TourAnchor): Promise<void> {
    await this.runExclusive(async () => {
      const anchors = await this.loadAnchors();
      const index = anchors.findIndex((candidate) => candidate.id === anchor.id);
      if (index < 0) {
        throw new Error(`Anchor id '${anchor.id}' does not exist in ${this.scope} storage.`);
      }
      const replacement = [...anchors];
      replacement[index] = anchor;
      await this.writeAnchors(replacement);
    });
  }

  protected abstract getRegistryDirectory(): Promise<Uri>;

  private async getRegistryUri(): Promise<Uri> {
    return this.fileSystem.joinPath(await this.getRegistryDirectory(), "anchors.yaml");
  }

  private async writeAnchors(anchors: readonly TourAnchor[]): Promise<void> {
    const directory = await this.getRegistryDirectory();
    await this.fileSystem.createDirectory(directory);
    const target = this.fileSystem.joinPath(directory, "anchors.yaml");
    const temporary = this.fileSystem.joinPath(directory, `.anchors.${randomUUID()}.tmp`);
    try {
      await this.fileSystem.writeFile(temporary, serializeAnchors(anchors));
      await this.fileSystem.renameFile(temporary, target, true);
    } catch (error) {
      try {
        if (await this.fileSystem.exists(temporary)) await this.fileSystem.deleteFile(temporary);
      } catch {
        // Preserve the original write error.
      }
      throw error;
    }
  }

  private async runExclusive(operation: () => Promise<void>): Promise<void> {
    const current = this.writeQueue.then(operation, operation);
    this.writeQueue = current.catch(() => undefined);
    await current;
  }
}
