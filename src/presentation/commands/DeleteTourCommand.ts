import type { DeleteTourUseCase, TourDeletionPlan } from "../../application/tours/DeleteTour";
import type { TourLister } from "../../application/tours/ListTours";
import type { TourScope} from "../../domain/tour/TourScope";
import { tourScopeChoices, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../application/tours/TourStorage";
import type { Logger } from "../../shared/logging/Logger";

export interface DeleteTourUserInterface {
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined>;
  confirmDeletion(plan: TourDeletionPlan): Promise<boolean>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

/** Deletes a tour file. Anchors are shared, so the registry is deliberately left untouched. */
export class DeleteTourCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly deleteTour: DeleteTourUseCase,
    private readonly userInterface: DeleteTourUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(tourScopeChoices);
    if (!scope) {
      return;
    }
    try {
      const tours = await this.listTours.execute(scope);
      if (tours.length === 0) {
        await this.userInterface.showInformation(`No ${scope} tours found.`);
        return;
      }
      const selected = await this.userInterface.chooseTour(tours);
      if (!selected) {
        return;
      }
      const plan = await this.deleteTour.plan(scope, selected.id);
      if (!(await this.userInterface.confirmDeletion(plan))) {
        return;
      }
      await this.deleteTour.execute(scope, selected.id);
      this.logger.info(`Deleted ${scope} tour '${selected.id}'.`);
      await this.userInterface.showInformation(`Deleted tour '${plan.title}'.`);
    } catch (error) {
      this.logger.error(`Failed to delete ${scope} tour`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not delete tour: ${message}`);
    }
  }
}
