import type { TourLister } from "../../application/tours/ListTours";
import type { RenameTourUseCase, TourRenamePlan } from "../../application/tours/RenameTour";
import type { TourScope} from "../../domain/tour/TourScope";
import { tourScopeChoices, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../application/tours/TourStorage";
import type { Logger } from "../../shared/logging/Logger";

export interface RenameTourUserInterface {
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined>;
  askForId(plan: TourRenamePlan, isTaken: (id: string) => boolean): Promise<string | undefined>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export class RenameTourCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly renameTour: RenameTourUseCase,
    private readonly userInterface: RenameTourUserInterface,
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
      const plan = await this.renameTour.plan(scope, selected.id);
      const taken = new Set(tours.map((tour) => tour.id));
      const nextId = await this.userInterface.askForId(
        plan,
        (id) => id.trim() !== plan.id && taken.has(id.trim()),
      );
      if (nextId === undefined || nextId.trim() === plan.id) {
        return;
      }
      await this.renameTour.execute(scope, plan.id, nextId);
      this.logger.info(`Renamed ${scope} tour '${plan.id}' to '${nextId.trim()}'.`);
      const updated = plan.referencedBy.length > 0
        ? ` Updated references in ${plan.referencedBy.join(", ")}.`
        : "";
      await this.userInterface.showInformation(
        `Renamed '${plan.id}' to '${nextId.trim()}'.${updated}`,
      );
    } catch (error) {
      this.logger.error(`Failed to rename ${scope} tour`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not rename tour: ${message}`);
    }
  }
}
