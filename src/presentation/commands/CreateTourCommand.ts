import type { CreateTourUseCase } from "../../application/tours/CreateTour";
import type {
  SourceWorkspace,
  TourSourceBindingStore,
} from "../../application/tours/TourSourceBinding";
import { TourScope } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";

export interface ScopeChoice {
  label: string;
  scope: TourScope;
  description: string;
}

export interface CreateTourUserInterface {
  chooseScope(choices: readonly ScopeChoice[]): Promise<TourScope | undefined>;
  askForTitle(): Promise<string | undefined>;
  getCurrentSourceWorkspace(): SourceWorkspace | undefined;
  openDocument(documentUri: string): Promise<void>;
  showSuccess(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

const scopeChoices: readonly ScopeChoice[] = [
  { label: "Personal", scope: TourScope.Personal, description: "Private to your VS Code user" },
  { label: "Workspace", scope: TourScope.Workspace, description: "Private to this workspace" },
  { label: "Repository", scope: TourScope.Repository, description: "Shared with repository collaborators" },
];

export class CreateTourCommand {
  public constructor(
    private readonly createTour: CreateTourUseCase,
    private readonly sourceBindings: TourSourceBindingStore,
    private readonly userInterface: CreateTourUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(scopeChoices);
    if (!scope) {
      return;
    }
    const title = await this.userInterface.askForTitle();
    if (title === undefined) {
      return;
    }
    try {
      const result = await this.createTour.execute({ scope, title });
      const sourceWorkspace = this.userInterface.getCurrentSourceWorkspace();
      if (scope === TourScope.Personal && sourceWorkspace) {
        await this.sourceBindings.set(scope, result.tour.id, sourceWorkspace.uri);
      }
      if (result.location.documentUri) {
        await this.userInterface.openDocument(result.location.documentUri);
      }
      await this.userInterface.showSuccess(`Created tour '${result.tour.title}' in ${scope} storage.`);
      this.logger.info(`Created tour ${result.tour.id} in ${scope} storage.`);
    } catch (error) {
      this.logger.error("Failed to create tour", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not create tour: ${message}`);
    }
  }
}
