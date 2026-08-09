import { window, type QuickPickItem } from "vscode";
import type { TourRenamePlan } from "../../application/tours/RenameTour";
import type { TourScope, TourScopeChoice } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../application/tours/TourStorage";
import type { RenameTourUserInterface } from "./RenameTourCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface TourItem extends QuickPickItem {
  tour: TourSummary;
}

export class VsCodeRenameTourUserInterface implements RenameTourUserInterface {
  public async chooseScope(
    choices: readonly TourScopeChoice[],
  ): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({ ...choice }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour scope" }))?.scope;
  }

  public async chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined> {
    const items: TourItem[] = tours.map((tour) => ({
      label: tour.title,
      description: tour.id,
      tour,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour to rename" }))?.tour;
  }

  public async askForId(
    plan: TourRenamePlan,
    isTaken: (id: string) => boolean,
  ): Promise<string | undefined> {
    const referencing = plan.referencedBy.length > 0
      ? ` References in ${plan.referencedBy.join(", ")} are updated.`
      : "";
    return window.showInputBox({
      prompt: `Enter a new id for '${plan.title}'.${referencing}`,
      value: plan.id,
      validateInput: (value) => {
        if (!value.trim()) {
          return "A tour id is required.";
        }
        return isTaken(value) ? `Tour id '${value.trim()}' is already used in this scope.` : undefined;
      },
    });
  }

  public async showInformation(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
