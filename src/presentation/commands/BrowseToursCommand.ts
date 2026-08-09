import type { ListTours } from "../../application/tours/ListTours";
import type { TourScope } from "../../domain/tour/TourScope";
import { tourScopeChoices } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../application/tours/TourStorage";
import type { Logger } from "../../shared/logging/Logger";

export interface BrowseScopeChoice {
  label: string;
  description: string;
  scope: TourScope;
}

export interface BrowseToursUserInterface {
  chooseScope(choices: readonly BrowseScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined>;
  openDocument(documentUri: string): Promise<void>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export class BrowseToursCommand {
  public constructor(
    private readonly listTours: ListTours,
    private readonly userInterface: BrowseToursUserInterface,
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
      const tour = await this.userInterface.chooseTour(tours);
      if (tour?.location.documentUri) {
        await this.userInterface.openDocument(tour.location.documentUri);
      }
    } catch (error) {
      this.logger.error(`Failed to browse ${scope} tours`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not browse tours: ${message}`);
    }
  }
}
