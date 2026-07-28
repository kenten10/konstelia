import type { TourHealthLister } from "../../application/tours/ListToursWithHealth";
import type { PlayTourUseCase } from "../../application/tours/PlayTour";
import type { TourLister } from "../../application/tours/ListTours";
import type {
  SourceWorkspace,
  TourSourceBindingStore,
} from "../../application/tours/TourSourceBinding";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import { TourScope } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";

export interface PlayTourScopeChoice {
  label: string;
  description: string;
  scope: TourScope;
}

export interface PlayTourUserInterface {
  chooseScope(choices: readonly PlayTourScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly PlayableTourSummary[]): Promise<PlayableTourSummary | undefined>;
  getCurrentSourceWorkspace(): SourceWorkspace | undefined;
  confirmPersonalSourceBinding(
    tour: PlayableTourSummary,
    sourceWorkspace: SourceWorkspace,
    existingSourceRoot: string | undefined,
  ): Promise<boolean>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export interface PlayableTourSummary extends TourSummary {
  readonly health?: AnchorHealth;
  readonly reasons?: readonly string[];
}

const scopeChoices: readonly PlayTourScopeChoice[] = [
  { label: "Personal", description: "Private tours for this VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private tours for this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Tours shared with repository collaborators", scope: TourScope.Repository },
];

export class PlayTourCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly listToursWithHealth: TourHealthLister,
    private readonly playTour: PlayTourUseCase,
    private readonly sourceBindings: TourSourceBindingStore,
    private readonly userInterface: PlayTourUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(scopeChoices);
    if (!scope) {
      return;
    }
    try {
      const tours: readonly PlayableTourSummary[] = scope === TourScope.Personal
        ? await this.listTours.execute(scope)
        : await this.listToursWithHealth.execute(scope);
      if (tours.length === 0) {
        await this.userInterface.showInformation(`No ${scope} tours found.`);
        return;
      }
      const tour = await this.userInterface.chooseTour(tours);
      if (tour) {
        if (!(await this.ensurePersonalSourceBinding(scope, tour))) {
          return;
        }
        const assessedTour = scope === TourScope.Personal
          ? (await this.listToursWithHealth.execute(scope)).find((candidate) => candidate.id === tour.id)
          : tour;
        if (!assessedTour) {
          throw new Error(`Tour '${tour.id}' was not found after source binding.`);
        }
        if (assessedTour.health === AnchorHealth.Broken) {
          await this.userInterface.showError(
            `Tour '${tour.title}' is under maintenance and cannot be played. ` +
            `${assessedTour.reasons?.join(" ") ?? ""}`.trim(),
          );
          return;
        }
        await this.playTour.execute(scope, tour.id);
      }
    } catch (error) {
      this.logger.error(`Failed to play ${scope} tour`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not play tour: ${message}`);
    }
  }

  private async ensurePersonalSourceBinding(
    scope: TourScope,
    tour: PlayableTourSummary,
  ): Promise<boolean> {
    if (scope !== TourScope.Personal) {
      return true;
    }
    const sourceWorkspace = this.userInterface.getCurrentSourceWorkspace();
    if (!sourceWorkspace) {
      throw new Error("Personal tour playback requires an open source workspace.");
    }
    const existingSourceRoot = await this.sourceBindings.get(scope, tour.id);
    if (existingSourceRoot === sourceWorkspace.uri) {
      return true;
    }
    const confirmed = await this.userInterface.confirmPersonalSourceBinding(
      tour,
      sourceWorkspace,
      existingSourceRoot,
    );
    if (!confirmed) {
      return false;
    }
    await this.sourceBindings.set(scope, tour.id, sourceWorkspace.uri);
    return true;
  }
}
