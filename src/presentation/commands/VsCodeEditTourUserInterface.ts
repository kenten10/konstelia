import { window, type QuickPickItem } from "vscode";
import type { TourDraft } from "../../application/tours/LoadTourDraft";
import type { TourScope, TourScopeChoice } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../application/tours/TourStorage";
import { TourEditorPanel } from "../editor/TourEditorPanel";
import type {
  EditTourUserInterface,
  TourEditorHost,
} from "./EditTourCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface TourItem extends QuickPickItem {
  tour: TourSummary;
}

export class VsCodeEditTourUserInterface implements EditTourUserInterface {
  public async chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({ ...choice }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour scope" }))?.scope;
  }

  public async chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined> {
    const items: TourItem[] = tours.map((tour) => ({
      label: tour.title,
      description: tour.id,
      detail: tour.location.uri.toString(),
      tour,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour to edit" }))?.tour;
  }

  public openEditor(draft: TourDraft, host: TourEditorHost): Promise<void> {
    TourEditorPanel.show(draft, host);
    return Promise.resolve();
  }

  public async showInformation(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
