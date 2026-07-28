import {
  Diagnostic,
  DiagnosticSeverity,
  languages,
  Range,
  window,
  workspace,
  type ExtensionContext,
  type TextDocument,
  type Uri,
} from "vscode";
import type {
  SavedSourceAnchorIssue,
  ValidateSavedSource,
} from "../../application/tours/ValidateSavedSource";
import { TourScope } from "../../domain/tour/TourScope";
import { isSupportedLanguageId } from "../../infrastructure/language/SupportedLanguages";
import { ScopeUnavailableError } from "../../shared/errors/KonsteliaError";
import type { Logger } from "../../shared/logging/Logger";

export class SourceAnchorDiagnostics {
  private readonly collection = languages.createDiagnosticCollection("konstelia-source-anchors");
  private readonly validationVersions = new Map<string, number>();

  public constructor(
    context: ExtensionContext,
    private readonly validateSavedSource: ValidateSavedSource,
    private readonly logger: Logger,
  ) {
    context.subscriptions.push(
      this.collection,
      workspace.onDidSaveTextDocument((document) => {
        if (isSupportedSource(document)) {
          void this.validate(document);
        }
      }),
    );
  }

  private async validate(document: TextDocument): Promise<void> {
    const folder = workspace.getWorkspaceFolder(document.uri);
    if (!folder) {
      return;
    }
    const key = document.uri.toString();
    const version = (this.validationVersions.get(key) ?? 0) + 1;
    this.validationVersions.set(key, version);
    const file = relativeFile(folder.uri, document.uri);
    const issues: SavedSourceAnchorIssue[] = [];

    for (const scope of [TourScope.Personal, TourScope.Workspace, TourScope.Repository]) {
      try {
        const result = await this.validateSavedSource.execute({
          scope,
          file,
          sourceText: document.getText(),
          sourceRoot: folder.uri.toString(),
        });
        issues.push(...result.issues);
      } catch (error) {
        if (!(error instanceof ScopeUnavailableError)) {
          this.logger.error(`Failed to validate ${scope} anchors after saving ${file}`, error);
        }
      }
    }

    if (this.validationVersions.get(key) !== version) {
      return;
    }
    this.collection.set(document.uri, issues.map((issue) => toDiagnostic(document, issue)));
    await notifyIssues(file, issues);
  }
}

function isSupportedSource(document: TextDocument): boolean {
  return isSupportedLanguageId(document.languageId);
}

function relativeFile(root: Uri, file: Uri): string {
  const rootPath = root.path.replace(/\/$/, "");
  return file.path.slice(rootPath.length + 1);
}

function toDiagnostic(document: TextDocument, issue: SavedSourceAnchorIssue): Diagnostic {
  const range = issue.range
    ? new Range(document.positionAt(issue.range.start), document.positionAt(issue.range.end))
    : new Range(0, 0, 0, Number.MAX_SAFE_INTEGER);
  const tours = [...new Set(issue.usages.map((usage) => usage.tourTitle))].join(", ");
  const diagnostic = new Diagnostic(
    range,
    `${capitalize(issue.scope)} anchor '${issue.anchorId}' is ${issue.health} for ${tours}. ${issue.reason ?? ""}`.trim(),
    issue.blocksPlayback ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
  );
  diagnostic.source = "Konstelia";
  diagnostic.code = issue.blocksPlayback ? "broken-primary-anchor" : "drifted-anchor";
  return diagnostic;
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

async function notifyIssues(file: string, issues: readonly SavedSourceAnchorIssue[]): Promise<void> {
  if (issues.length === 0) {
    return;
  }
  const blocking = issues.filter((issue) => issue.blocksPlayback);
  const affectedTours = new Set(
    issues.flatMap((issue) => issue.usages.map((usage) => usage.tourTitle)),
  );
  const message = blocking.length > 0
    ? `Saving ${file} broke ${blocking.length} primary Konstelia anchor${blocking.length === 1 ? "" : "s"} in ${[...affectedTours].join(", ")}.`
    : `Saving ${file} left ${issues.length} Konstelia anchor${issues.length === 1 ? "" : "s"} drifted in ${[...affectedTours].join(", ")}.`;
  if (blocking.length > 0) {
    await window.showErrorMessage(message);
  } else {
    await window.showWarningMessage(message);
  }
}
