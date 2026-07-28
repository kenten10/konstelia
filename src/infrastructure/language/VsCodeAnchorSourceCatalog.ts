import {
  ProgressLocation,
  RelativePattern,
  Uri,
  window,
  workspace,
} from "vscode";
import type {
  AnchorSourceCatalog,
  AnchorSourceDocument,
  AnchorSourceScan,
} from "../../application/anchors/AnchorSourceCatalog";
import { supportedSourceGlob } from "./SupportedLanguages";

export class VsCodeAnchorSourceCatalog implements AnchorSourceCatalog {
  public async scanSources(): Promise<AnchorSourceScan> {
    const folder = workspace.workspaceFolders?.[0];
    if (!folder) return { sources: [], skippedFiles: 0, cancelled: false };
    return window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: "Konstelia: Finding anchor repair candidates",
        cancellable: true,
      },
      async (progress, token): Promise<AnchorSourceScan> => {
        const uris = (await workspace.findFiles(
          new RelativePattern(folder, supportedSourceGlob),
          "**/{node_modules,.git,dist,out,build,.konstelia}/**",
        )).filter((uri) => !uri.path.endsWith(".d.ts"));
        const sources: AnchorSourceDocument[] = [];
        let skippedFiles = 0;
        let nextIndex = 0;
        const worker = async (): Promise<void> => {
          while (!token.isCancellationRequested) {
            const index = nextIndex;
            nextIndex += 1;
            const uri = uris[index];
            if (!uri) return;
            const file = workspaceRelativePath(folder.uri, uri);
            try {
              if (file) {
                sources.push({ file, sourceText: await readUri(uri) });
              } else {
                skippedFiles += 1;
              }
            } catch {
              skippedFiles += 1;
            }
            progress.report({
              increment: uris.length > 0 ? 100 / uris.length : 100,
              message: `${Math.min(nextIndex, uris.length)} of ${uris.length} files`,
            });
          }
        };
        const workerCount = Math.min(maximumConcurrentReads, uris.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        return { sources, skippedFiles, cancelled: token.isCancellationRequested };
      },
    );
  }

  public async readSource(file: string): Promise<string | undefined> {
    const root = workspace.workspaceFolders?.[0]?.uri;
    if (!root || !isSafeRelativeFile(file)) return undefined;
    try {
      return await readUri(Uri.joinPath(root, file));
    } catch {
      return undefined;
    }
  }
}

const maximumConcurrentReads = 8;
const decoder = new TextDecoder();

async function readUri(uri: Uri): Promise<string> {
  const openDocument = workspace.textDocuments.find((document) => document.uri.toString() === uri.toString());
  return openDocument?.getText() ?? decoder.decode(await workspace.fs.readFile(uri));
}

function workspaceRelativePath(root: Uri, uri: Uri): string | undefined {
  const rootPath = root.path.replace(/\/$/, "");
  if (!uri.path.startsWith(`${rootPath}/`)) return undefined;
  return uri.path.slice(rootPath.length + 1);
}

function isSafeRelativeFile(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  return Boolean(file) && !normalized.startsWith("/") && !normalized.split("/").includes("..");
}
