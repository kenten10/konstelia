import type { TourLister } from "../../application/tours/ListTours";
import type {
  MaybeHealthyTourSummary,
  TourHealthLister,
} from "../../application/tours/ListToursWithHealth";
import type { LoadTourFlowUseCase, TourFlowSnapshot } from "../../application/tours/LoadTourFlow";
import { TourScope } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";

export interface ShowFlowDiagramScopeChoice {
  label: string;
  description: string;
  scope: TourScope;
}

export interface ShowFlowDiagramUserInterface {
  chooseScope(choices: readonly ShowFlowDiagramScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly MaybeHealthyTourSummary[]): Promise<MaybeHealthyTourSummary | undefined>;
  showDiagram(snapshot: TourFlowSnapshot): Promise<void>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

const scopeChoices: readonly ShowFlowDiagramScopeChoice[] = [
  { label: "Personal", description: "Private tours for this VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private tours for this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Tours shared with repository collaborators", scope: TourScope.Repository },
];

export class ShowFlowDiagramCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly listToursWithHealth: TourHealthLister,
    private readonly loadTourFlow: LoadTourFlowUseCase,
    private readonly userInterface: ShowFlowDiagramUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(scopeChoices);
    if (!scope) {
      return;
    }
    try {
      // Personal tours are only bound to a source workspace at playback time, so their health
      // cannot be assessed here. Every other scope is listed the same way playback lists it.
      const tours: readonly MaybeHealthyTourSummary[] = scope === TourScope.Personal
        ? await this.listTours.execute(scope)
        : await this.listToursWithHealth.execute(scope);
      if (tours.length === 0) {
        await this.userInterface.showInformation(`No ${scope} tours found.`);
        return;
      }
      const selected = await this.userInterface.chooseTour(tours);
      if (!selected) {
        return;
      }
      await this.userInterface.showDiagram(await this.loadTourFlow.execute(scope, selected.id));
      this.logger.info(`Showed the flow diagram for ${scope} tour '${selected.id}'.`);
    } catch (error) {
      this.logger.error(`Failed to show the flow diagram for a ${scope} tour`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not show the flow diagram: ${message}`);
    }
  }
}
