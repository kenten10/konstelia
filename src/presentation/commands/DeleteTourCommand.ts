import type { DeleteTourUseCase, TourDeletionPlan } from "../../application/tours/DeleteTour";
import type { TourLister } from "../../application/tours/ListTours";
import { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";
import type { Logger } from "../../shared/logging/Logger";

export interface DeleteTourScopeChoice {
  label: string;
  description: string;
  scope: TourScope;
}

export interface DeleteTourUserInterface {
  chooseScope(choices: readonly DeleteTourScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined>;
  confirmDeletion(plan: TourDeletionPlan): Promise<boolean>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

const scopeChoices: readonly DeleteTourScopeChoice[] = [
  { label: "Personal", description: "Private tours for this VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private tours for this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Tours shared with repository collaborators", scope: TourScope.Repository },
];

/** Deletes a tour file. Anchors are shared, so the registry is deliberately left untouched. */
export class DeleteTourCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly deleteTour: DeleteTourUseCase,
    private readonly userInterface: DeleteTourUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(scopeChoices);
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
