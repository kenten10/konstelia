import { window } from "vscode";
import type { PlaySampleTourUserInterface } from "./PlaySampleTourCommand";

export class VsCodePlaySampleTourUserInterface implements PlaySampleTourUserInterface {
  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
