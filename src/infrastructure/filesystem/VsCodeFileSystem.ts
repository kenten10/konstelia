import { FileType, Uri, workspace } from "vscode";
import { FileKind, type FileEntry, type FileSystem } from "./FileSystem";

export class VsCodeFileSystem implements FileSystem {
  public joinPath(base: Uri, ...segments: string[]): Uri {
    return Uri.joinPath(base, ...segments);
  }

  public async createDirectory(uri: Uri): Promise<void> {
    await workspace.fs.createDirectory(uri);
  }

  public async readFile(uri: Uri): Promise<Uint8Array> {
    return workspace.fs.readFile(uri);
  }

  public async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
    await workspace.fs.writeFile(uri, content);
  }

  public async renameFile(source: Uri, target: Uri, overwrite: boolean): Promise<void> {
    await workspace.fs.rename(source, target, { overwrite });
  }

  public async listDirectory(uri: Uri): Promise<FileEntry[]> {
    const entries = await workspace.fs.readDirectory(uri);
    return entries.map(([name, type]) => ({
      name,
      kind: type === FileType.Directory ? FileKind.Directory : FileKind.File,
    }));
  }

  public async deleteFile(uri: Uri): Promise<void> {
    await workspace.fs.delete(uri, { recursive: false, useTrash: false });
  }

  public async exists(uri: Uri): Promise<boolean> {
    try {
      await workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }
}
