import { window, type QuickPickItem } from "vscode";
import type { MaybeHealthyTourSummary } from "../../application/tours/ListToursWithHealth";
import type { TourFlowSnapshot } from "../../application/tours/LoadTourFlow";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourFlowDiagramView } from "../flow/TourFlowDiagramView";
import type {
  ShowFlowDiagramScopeChoice,
  ShowFlowDiagramUserInterface,
} from "./ShowFlowDiagramCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface TourItem extends QuickPickItem {
  tour: MaybeHealthyTourSummary;
}

export class VsCodeShowFlowDiagramUserInterface implements ShowFlowDiagramUserInterface {
  public constructor(private readonly view: TourFlowDiagramView) {}

  public async chooseScope(
    choices: readonly ShowFlowDiagramScopeChoice[],
  ): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({ ...choice }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour scope" }))?.scope;
  }

  public async chooseTour(
    tours: readonly MaybeHealthyTourSummary[],
  ): Promise<MaybeHealthyTourSummary | undefined> {
    const items: TourItem[] = tours.map((tour) => ({
      label: !tour.health || tour.health === AnchorHealth.Healthy ? tour.title : `$(warning) ${tour.title}`,
      description: tour.health ? `${tour.id} - ${tour.health}` : `${tour.id} - source checked after selection`,
      detail: tour.reasons?.[0],
      tour,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour to diagram" }))?.tour;
  }

  public showDiagram(scope: TourScope, snapshot: TourFlowSnapshot): Promise<void> {
    return this.view.show(scope, snapshot.tour, snapshot.anchorHealth);
  }

  public async showInformation(message: string): Promise<void> {
    await window.showInformationMessage(message);
  }

  public async showError(message: string): Promise<void> {
    await window.showErrorMessage(message);
  }
}
