import type { TourLister } from "../../application/tours/ListTours";
import type {
  MaybeHealthyTourSummary,
  TourHealthLister,
} from "../../application/tours/ListToursWithHealth";
import type { LoadTourFlowUseCase, TourFlowSnapshot } from "../../application/tours/LoadTourFlow";
import { tourScopeChoices, TourScope, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";

export interface ShowFlowDiagramUserInterface {
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly MaybeHealthyTourSummary[]): Promise<MaybeHealthyTourSummary | undefined>;
  showDiagram(scope: TourScope, snapshot: TourFlowSnapshot): Promise<void>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export class ShowFlowDiagramCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly listToursWithHealth: TourHealthLister,
    private readonly loadTourFlow: LoadTourFlowUseCase,
    private readonly userInterface: ShowFlowDiagramUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(tourScopeChoices);
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
      await this.userInterface.showDiagram(scope, await this.loadTourFlow.execute(scope, selected.id));
      this.logger.info(`Showed the flow diagram for ${scope} tour '${selected.id}'.`);
    } catch (error) {
      this.logger.error(`Failed to show the flow diagram for a ${scope} tour`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not show the flow diagram: ${message}`);
    }
  }
}
