import { window, workspace, type QuickPickItem } from "vscode";
import type { SourceWorkspace } from "../../application/tours/TourSourceBinding";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type {
  PlayableTourSummary,
  PlayTourScopeChoice,
  PlayTourUserInterface,
} from "./PlayTourCommand";

interface ScopeItem extends QuickPickItem {
  scope: TourScope;
}

interface TourItem extends QuickPickItem {
  tour: PlayableTourSummary;
}

export class VsCodePlayTourUserInterface implements PlayTourUserInterface {
  public async chooseScope(choices: readonly PlayTourScopeChoice[]): Promise<TourScope | undefined> {
    const items: ScopeItem[] = choices.map((choice) => ({ ...choice }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour scope" }))?.scope;
  }

  public async chooseTour(tours: readonly PlayableTourSummary[]): Promise<PlayableTourSummary | undefined> {
    const items: TourItem[] = tours.map((tour) => ({
      label: !tour.health || tour.health === AnchorHealth.Healthy ? tour.title : `$(warning) ${tour.title}`,
      description: tour.health ? `${tour.id} - ${tour.health}` : `${tour.id} - source checked after selection`,
      detail: tour.reasons?.[0],
      tour,
    }));
    return (await window.showQuickPick(items, { placeHolder: "Choose a tour to play" }))?.tour;
  }

  public getCurrentSourceWorkspace(): SourceWorkspace | undefined {
    const folder = workspace.workspaceFolders?.[0];
    return folder ? { uri: folder.uri.toString(), name: folder.name } : undefined;
  }

  public async confirmPersonalSourceBinding(
    tour: PlayableTourSummary,
    sourceWorkspace: SourceWorkspace,
    existingSourceRoot: string | undefined,
  ): Promise<boolean> {
    const action = existingSourceRoot ? "Rebind and Play" : "Bind and Play";
    const detail = existingSourceRoot
      ? `This tour is currently bound to ${existingSourceRoot}. Rebind it to ${sourceWorkspace.uri}?`
      : `Bind this tour to ${sourceWorkspace.uri}?`;
    return (
      await window.showWarningMessage(
        `Play '${tour.title}' against workspace '${sourceWorkspace.name}'?`,
        { modal: true, detail },
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
