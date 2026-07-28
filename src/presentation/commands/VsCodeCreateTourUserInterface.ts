import { window, workspace, type QuickPickItem, type Uri } from "vscode";
import type { TourScope } from "../../domain/tour/TourScope";
import type { SourceWorkspace } from "../../application/tours/TourSourceBinding";
import type { CreateTourUserInterface, ScopeChoice } from "./CreateTourCommand";

interface ScopeQuickPickItem extends QuickPickItem {
  scope: TourScope;
}

export class VsCodeCreateTourUserInterface implements CreateTourUserInterface {
  public async chooseScope(choices: readonly ScopeChoice[]): Promise<TourScope | undefined> {
    const items: ScopeQuickPickItem[] = choices.map((choice) => ({
      label: choice.label,
      description: choice.description,
      scope: choice.scope,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose where to store the tour" }))?.scope;
  }

  public async askForTitle(): Promise<string | undefined> {
    return window.showInputBox({
      prompt: "Enter a title for the new tour",
      placeHolder: "Authentication flow",
      validateInput: (value) => (value.trim() ? undefined : "A title is required."),
    });
  }

  public getCurrentSourceWorkspace(): SourceWorkspace | undefined {
    const folder = workspace.workspaceFolders?.[0];
    return folder ? { uri: folder.uri.toString(), name: folder.name } : undefined;
  }

  public async openDocument(uri: Uri): Promise<void> {
    const document = await workspace.openTextDocument(uri);
    await window.showTextDocument(document, { preview: false });
  }

  public async showSuccess(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
