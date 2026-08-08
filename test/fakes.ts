import type { Uri } from "vscode";
import { FileKind, type FileEntry, type FileSystem } from "../src/infrastructure/filesystem/FileSystem";

export interface TestUri extends Uri {
  readonly testPath: string;
}

export function uri(path: string): Uri {
  return {
    testPath: normalize(path),
    toString(): string {
      return this.testPath;
    },
  } as TestUri;
}

function pathOf(value: Uri): string {
  return (value as TestUri).testPath;
}

function normalize(path: string): string {
  const normalized = path.replace(/([^:])\/{2,}/g, "$1/").replace(/\/+$/, "");
  return normalized || "/";
}

export class InMemoryFileSystem implements FileSystem {
  public readonly directories = new Set<string>();
  public readonly files = new Map<string, Uint8Array>();

  public joinPath(base: Uri, ...segments: string[]): Uri {
    return uri([pathOf(base), ...segments].join("/"));
  }

  public createDirectory(value: Uri): Promise<void> {
    this.directories.add(pathOf(value));
    return Promise.resolve();
  }

  public readFile(value: Uri): Promise<Uint8Array> {
    const content = this.files.get(pathOf(value));
    if (!content) {
      return Promise.reject(new Error(`Missing file: ${pathOf(value)}`));
    }
    return Promise.resolve(content);
  }

  public writeFile(value: Uri, content: Uint8Array): Promise<void> {
    this.files.set(pathOf(value), content);
    return Promise.resolve();
  }

  public renameFile(source: Uri, target: Uri, overwrite: boolean): Promise<void> {
    const sourcePath = pathOf(source);
    const targetPath = pathOf(target);
    const content = this.files.get(sourcePath);
    if (!content) return Promise.reject(new Error(`Missing file: ${sourcePath}`));
    if (!overwrite && this.files.has(targetPath)) return Promise.reject(new Error(`File exists: ${targetPath}`));
    this.files.set(targetPath, content);
    this.files.delete(sourcePath);
    return Promise.resolve();
  }

  public listDirectory(value: Uri): Promise<FileEntry[]> {
    const prefix = `${pathOf(value)}/`;
    const entries = [...this.files.keys()]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map((path) => ({ name: path.slice(prefix.length), kind: FileKind.File }));
    return Promise.resolve(entries);
  }

  public deleteFile(value: Uri): Promise<void> {
    this.files.delete(pathOf(value));
    return Promise.resolve();
  }

  public exists(value: Uri): Promise<boolean> {
    const path = pathOf(value);
    return Promise.resolve(this.files.has(path) || this.directories.has(path));
  }
}
