import {
  commands,
  EventEmitter,
  Uri,
  window,
  workspace,
  type Event,
  type ExtensionContext,
  type QuickPickItem,
  type TextDocumentContentProvider,
} from "vscode";
import type {
  RepairAnchorCandidate,
  RepairAnchorPreparation,
} from "../../application/anchors/RepairAnchor";
import { sourceExtension } from "../../infrastructure/language/SupportedLanguages";
import type { AnchorRepairTarget } from "../../application/anchors/DiscoverAnchorRepairs";
import type { ProposeAnchorInput } from "../../application/anchors/CreateAnchor";
import { formatAnchorReference } from "../../domain/tour/AnchorReference";
import { AnchorHealth, type TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourScope, TourScopeChoice } from "../../domain/tour/TourScope";
import type { RepairAnchorUserInterface } from "./RepairAnchorCommand";
import type { DiscoverAnchorRepairsUserInterface } from "./DiscoverAnchorRepairsCommand";
import type { SourceWorkspace } from "../../application/tours/TourSourceBinding";
import { captureSemanticSelection } from "./VsCodeCreateAnchorUserInterface";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface AnchorItem extends QuickPickItem {
  candidate: RepairAnchorCandidate;
}

interface StoredAnchorItem extends QuickPickItem {
  anchor: TourAnchor;
}

interface RepairTargetItem extends QuickPickItem {
  target: AnchorRepairTarget;
}

export class VsCodeRepairAnchorUserInterface implements
  RepairAnchorUserInterface,
  DiscoverAnchorRepairsUserInterface {
  private readonly previewProvider = new RepairPreviewContentProvider();

  public constructor(context: ExtensionContext) {
    context.subscriptions.push(
      this.previewProvider,
      workspace.registerTextDocumentContentProvider(
        repairPreviewScheme,
        this.previewProvider,
      ),
    );
  }

  public captureSelection(): Promise<ProposeAnchorInput | undefined> {
    return captureSemanticSelection();
  }

  public getCurrentSourceWorkspace(): SourceWorkspace | undefined {
    const folder = workspace.workspaceFolders?.[0];
    return folder ? { uri: folder.uri.toString(), name: folder.name } : undefined;
  }

  public async chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({ ...choice }));
    return (await window.showQuickPick(items, {
      placeHolder: "Choose the scope containing the anchor",
    }))?.scope;
  }

  public async chooseAnchor(
    candidates: readonly RepairAnchorCandidate[],
  ): Promise<RepairAnchorCandidate | undefined> {
    const items: AnchorItem[] = candidates.map((candidate) => ({
      label: !candidate.health || candidate.health === AnchorHealth.Healthy
        ? candidate.anchor.id
        : `$(warning) ${candidate.anchor.id}`,
      description: candidate.health ?? candidate.anchor.file,
      detail: `${candidate.reference}${candidate.reason ? ` - ${candidate.reason}` : ""}`,
      candidate,
    }));
    return (await window.showQuickPick(items, {
      placeHolder: "Choose the anchor to rebind",
    }))?.candidate;
  }

  public async chooseStoredAnchor(anchors: readonly TourAnchor[]): Promise<TourAnchor | undefined> {
    const items: StoredAnchorItem[] = anchors.map((anchor) => ({
      label: anchor.id,
      description: anchor.file,
      detail: formatAnchorReference(anchor),
      anchor,
    }));
    return (await window.showQuickPick(items, {
      placeHolder: "Choose the anchor to repair",
    }))?.anchor;
  }

  public async chooseRepairTarget(
    targets: readonly AnchorRepairTarget[],
  ): Promise<AnchorRepairTarget | undefined> {
    const items: RepairTargetItem[] = targets.map((target, index) => ({
      label: `${index + 1}. ${formatAnchorReference(target.proposal)}`,
      description: `${Math.round(target.similarity * 100)}% match`,
      detail: target.proposal.snapshot.text.split("\n")[0],
      target,
    }));
    return (await window.showQuickPick(items, {
      placeHolder: "Choose a ranked repair candidate",
      matchOnDescription: true,
      matchOnDetail: true,
    }))?.target;
  }

  public async confirmRebind(
    candidate: RepairAnchorCandidate,
    preparation: RepairAnchorPreparation,
  ): Promise<boolean> {
    return this.confirmWithPreview(
      candidate.anchor.id,
      candidate.anchor.snapshot?.text ?? "Snapshot is not available for this anchor.",
      preparation.proposal.snapshot.text,
      candidate.reference,
      formatAnchorReference(preparation.proposal),
      preparation.proposal.file,
    );
  }

  public async confirmDiscoveredRebind(
    anchor: TourAnchor,
    target: AnchorRepairTarget,
  ): Promise<boolean> {
    return this.confirmWithPreview(
      anchor.id,
      anchor.snapshot?.text ?? "Snapshot is not available for this anchor.",
      target.proposal.snapshot.text,
      formatAnchorReference(anchor),
      formatAnchorReference(target.proposal),
      target.proposal.file,
    );
  }

  private async confirmWithPreview(
    anchorId: string,
    snapshot: string,
    selectedTarget: string,
    currentReference: string,
    nextReference: string,
    targetFile: string,
  ): Promise<boolean> {
    const action = "Rebind";
    const previewUris = this.previewProvider.update(anchorId, snapshot, selectedTarget, targetFile);
    await commands.executeCommand(
      "vscode.diff",
      previewUris.snapshot,
      previewUris.selectedTarget,
      `Konstelia Repair: ${anchorId} (snapshot <-> selected target)`,
      { preview: true },
    );
    return (await window.showWarningMessage(
      `Rebind anchor '${anchorId}'?`,
      // `detail` is only rendered for modal messages, and the before/after references are the
      // whole point of this confirmation.
      {
        modal: true,
        detail: `Current: ${currentReference}\nNew: ${nextReference}`,
      },
      action,
    )) === action;
  }

  public async showInformation(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showSuccess(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}

const repairPreviewScheme = "konstelia-repair-preview";

class RepairPreviewContentProvider implements TextDocumentContentProvider {
  private readonly contents = new Map<string, string>();
  private readonly changed = new EventEmitter<Uri>();

  public readonly onDidChange: Event<Uri> = this.changed.event;

  public update(
    anchorId: string,
    snapshot: string,
    selectedTarget: string,
    targetFile: string,
  ): { snapshot: Uri; selectedTarget: Uri } {
    const safeId = encodeURIComponent(anchorId);
    const extension = sourceExtension(targetFile);
    const snapshotUri = Uri.parse(`${repairPreviewScheme}:/${safeId}/snapshot.${extension}`);
    const selectedTargetUri = Uri.parse(`${repairPreviewScheme}:/${safeId}/selected-target.${extension}`);
    this.setContent(snapshotUri, snapshot);
    this.setContent(selectedTargetUri, selectedTarget);
    return { snapshot: snapshotUri, selectedTarget: selectedTargetUri };
  }

  public provideTextDocumentContent(uri: Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }

  public dispose(): void {
    this.changed.dispose();
    this.contents.clear();
  }

  private setContent(uri: Uri, content: string): void {
    this.contents.set(uri.toString(), `${content}\n`);
    this.changed.fire(uri);
  }
}
