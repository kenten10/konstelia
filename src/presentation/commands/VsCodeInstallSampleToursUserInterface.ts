import { commands, window, workspace, type Memento, type Uri } from "vscode";
import type { SourceWorkspace } from "../../application/tours/TourSourceBinding";
import type { InstallSampleToursUserInterface } from "./InstallSampleToursCommand";

export const pendingSampleInstallationKey = "konstelia.pendingSampleInstallation";

export class VsCodeInstallSampleToursUserInterface implements InstallSampleToursUserInterface {
  public constructor(
    private readonly bundledWorkspace: Uri,
    private readonly state: Memento,
  ) {}

  public getCurrentSourceWorkspace(): SourceWorkspace | undefined {
    const folder = workspace.workspaceFolders?.[0];
    return folder ? { uri: folder.uri.toString(), name: folder.name } : undefined;
  }

  public isBundledSampleWorkspace(sourceWorkspace: SourceWorkspace): boolean {
    return normalizeUri(sourceWorkspace.uri) === normalizeUri(this.bundledWorkspace.toString());
  }

  public async openBundledSampleWorkspace(): Promise<boolean> {
    const action = "Open Sample Workspace";
    const selected = await window.showInformationMessage(
      "Sample tours are installed only in the bundled Konstelia workspace.",
      { modal: true, detail: "Open the bundled Konstelia workspace. Installation will continue automatically after reload." },
      action,
    );
    if (selected !== action) {
      return false;
    }
    await this.state.update(pendingSampleInstallationKey, true);
    await commands.executeCommand("vscode.openFolder", this.bundledWorkspace, false);
    return true;
  }

  public async showSuccess(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}

function normalizeUri(value: string): string {
  return value.replace(/\/$/, "");
}
