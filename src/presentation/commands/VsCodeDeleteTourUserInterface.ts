import { window, type QuickPickItem } from "vscode";
import type { TourDeletionPlan } from "../../application/tours/DeleteTour";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";
import type {
  DeleteTourScopeChoice,
  DeleteTourUserInterface,
} from "./DeleteTourCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface TourItem extends QuickPickItem {
  tour: TourSummary;
}

export class VsCodeDeleteTourUserInterface implements DeleteTourUserInterface {
  public async chooseScope(
    choices: readonly DeleteTourScopeChoice[],
  ): Promise<TourScope | undefined> {
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
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour to delete" }))?.tour;
  }

  public async confirmDeletion(plan: TourDeletionPlan): Promise<boolean> {
    const action = "Delete Tour";
    const dangling = plan.referencedBy.length > 0
      ? ` Other tours reference it and would be left with dangling references: ${plan.referencedBy.join(", ")}.`
      : "";
    return (
      await window.showWarningMessage(
        `Delete tour '${plan.title}'?`,
        {
          modal: true,
          detail: `The tour file is removed. Anchors stay in the registry because other tours may use them.${dangling}`,
        },
        action,
      )
    ) === action;
  }

  public async showInformation(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
