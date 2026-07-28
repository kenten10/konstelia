import type { Uri } from "vscode";

export enum FileKind {
  File = "file",
  Directory = "directory",
}

export interface FileEntry {
  name: string;
  kind: FileKind;
}

export interface FileSystem {
  joinPath(base: Uri, ...segments: string[]): Uri;
  createDirectory(uri: Uri): Promise<void>;
  readFile(uri: Uri): Promise<Uint8Array>;
  writeFile(uri: Uri, content: Uint8Array): Promise<void>;
  renameFile(source: Uri, target: Uri, overwrite: boolean): Promise<void>;
  listDirectory(uri: Uri): Promise<FileEntry[]>;
  deleteFile(uri: Uri): Promise<void>;
  exists(uri: Uri): Promise<boolean>;
}
