import { Uri, window, workspace, type QuickPickItem } from "vscode";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";
import type {
  BrowseScopeChoice,
  BrowseToursUserInterface,
} from "./BrowseToursCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface TourItem extends QuickPickItem {
  tour: TourSummary;
}

export class VsCodeBrowseToursUserInterface implements BrowseToursUserInterface {
  public async chooseScope(choices: readonly BrowseScopeChoice[]): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({
      label: choice.label,
      description: choice.description,
      scope: choice.scope,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour scope" }))?.scope;
  }

  public async chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined> {
    const items: TourItem[] = tours.map((tour) => ({
      label: tour.title,
      description: tour.id,
      tour,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour" }))?.tour;
  }

  public async openDocument(documentUri: string): Promise<void> {
    const document = await workspace.openTextDocument(Uri.parse(documentUri));
    await window.showTextDocument(document, { preview: false });
  }

  public async showInformation(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
