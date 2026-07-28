import type { Uri } from "vscode";
import type { ListTours } from "../../application/tours/ListTours";
import { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";
import type { Logger } from "../../shared/logging/Logger";

export interface BrowseScopeChoice {
  label: string;
  description: string;
  scope: TourScope;
}

export interface BrowseToursUserInterface {
  chooseScope(choices: readonly BrowseScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined>;
  openDocument(uri: Uri): Promise<void>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

const scopeChoices: readonly BrowseScopeChoice[] = [
  { label: "Personal", description: "Private tours for this VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private tours for this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Tours shared with repository collaborators", scope: TourScope.Repository },
];

export class BrowseToursCommand {
  public constructor(
    private readonly listTours: ListTours,
    private readonly userInterface: BrowseToursUserInterface,
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
