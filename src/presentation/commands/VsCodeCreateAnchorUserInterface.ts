import { window, workspace, type QuickPickItem } from "vscode";
import type { AnchorProposal, ProposeAnchorInput } from "../../application/anchors/CreateAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import { isSupportedLanguageId } from "../../infrastructure/language/SupportedLanguages";
import type {
  AnchorScopeChoice,
  CreateAnchorUserInterface,
} from "./CreateAnchorCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

export class VsCodeCreateAnchorUserInterface implements CreateAnchorUserInterface {
  public captureSelection(): Promise<ProposeAnchorInput | undefined> {
    return captureSemanticSelection();
  }

  public async confirmSnappedTarget(proposal: AnchorProposal): Promise<boolean> {
    const action = "Create Anchor";
    const selected = await window.showWarningMessage(
      `The selection cannot be anchored exactly and will use '${proposal.symbol}${proposal.refinement ? `@${proposal.refinement}` : ""}'.`,
      { modal: true, detail: proposal.note ?? "The anchor will use the nearest stable semantic range." },
      action,
    );
    return selected === action;
  }

  public async chooseScope(choices: readonly AnchorScopeChoice[]): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({
      label: choice.label,
      description: choice.description,
      scope: choice.scope,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose where to store the anchor" }))?.scope;
  }

  public async askForId(suggestedId: string): Promise<string | undefined> {
    return window.showInputBox({
      prompt: "Enter an anchor id",
      value: suggestedId,
      validateInput: (value) => (value.trim() ? undefined : "An anchor id is required."),
    });
  }

  public async showSuccess(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}

export function captureSemanticSelection(): Promise<ProposeAnchorInput | undefined> {
  const editor = window.activeTextEditor;
  if (!editor) {
    return Promise.reject(new Error("Open a supported source file and select code first."));
  }
  if (!isSupportedLanguageId(editor.document.languageId)) {
    return Promise.reject(new Error("Semantic anchor authoring does not support this file's language."));
  }
  if (editor.selection.isEmpty) {
    return Promise.reject(new Error("Select the code that the anchor should identify."));
  }
  const folder = workspace.getWorkspaceFolder(editor.document.uri);
  if (!folder) {
    return Promise.reject(new Error("Semantic anchor authoring requires the selected file to be in an open workspace."));
  }
  const file = editor.document.uri.path.slice(folder.uri.path.replace(/\/$/, "").length + 1);
  return Promise.resolve({
    file,
    sourceText: editor.document.getText(),
    selectionStart: editor.document.offsetAt(editor.selection.start),
    selectionEnd: editor.document.offsetAt(editor.selection.end),
  });
}
