import {
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Range,
  workspace,
  type ExtensionContext,
  type Uri,
} from "vscode";
import type { ValidateTourCatalog } from "../../application/tours/ValidateTourCatalog";
import { TourScope } from "../../domain/tour/TourScope";
import { ScopeUnavailableError } from "../../shared/errors/KonsteliaError";
import type { Logger } from "../../shared/logging/Logger";

export class TourDiagnostics {
  private readonly collection = languages.createDiagnosticCollection("konstelia");
  private refreshVersion = 0;

  public constructor(
    context: ExtensionContext,
    private readonly validateCatalog: ValidateTourCatalog,
    private readonly logger: Logger,
  ) {
    const tourWatcher = workspace.createFileSystemWatcher("**/*.tour.yaml");
    const anchorWatcher = workspace.createFileSystemWatcher("**/anchors.yaml");
    context.subscriptions.push(
      this.collection,
      tourWatcher,
      anchorWatcher,
      tourWatcher.onDidCreate(() => void this.refresh()),
      tourWatcher.onDidChange(() => void this.refresh()),
      tourWatcher.onDidDelete(() => void this.refresh()),
      anchorWatcher.onDidCreate(() => void this.refresh()),
      anchorWatcher.onDidChange(() => void this.refresh()),
      anchorWatcher.onDidDelete(() => void this.refresh()),
      workspace.onDidOpenTextDocument((document) => {
        if (isTourMetadata(document.uri.path)) {
          void this.refresh();
        }
      }),
      workspace.onDidSaveTextDocument((document) => {
        if (isTourMetadata(document.uri.path)) {
          void this.refresh();
        }
      }),
    );
  }

  public async refresh(): Promise<void> {
    const version = ++this.refreshVersion;
    const diagnostics = new Map<string, { uri: Uri; items: Diagnostic[] }>();
    for (const scope of [TourScope.Personal, TourScope.Workspace, TourScope.Repository]) {
      try {
        for (const file of await this.validateCatalog.execute(scope)) {
          const items = file.issues.map((issue) => {
            const diagnostic = new Diagnostic(
              new Range(0, 0, 0, Number.MAX_SAFE_INTEGER),
              `${issue.path}: ${issue.message}`,
              DiagnosticSeverity.Error,
            );
            diagnostic.source = "Konstelia";
            diagnostic.code = "invalid-tour";
            return diagnostic;
          });
          diagnostics.set(file.location.uri.toString(), { uri: file.location.uri, items });
        }
      } catch (error) {
        if (!(error instanceof ScopeUnavailableError)) {
          this.logger.error(`Failed to validate ${scope} tours`, error);
        }
      }
    }
    if (version !== this.refreshVersion) {
      return;
    }
    this.collection.clear();
    for (const { uri, items } of diagnostics.values()) {
      if (items.length > 0) {
        this.collection.set(uri, items);
      }
    }
  }
}

function isTourMetadata(path: string): boolean {
  return path.endsWith(".tour.yaml") || path.endsWith("/anchors.yaml");
}
