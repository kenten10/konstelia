import type {
  MaybeHealthyTourSummary,
  TourHealthLister,
} from "../../application/tours/ListToursWithHealth";
import type { PlayTourUseCase } from "../../application/tours/PlayTour";
import type { PlaybackPosition } from "../../application/tours/TourPlaybackActions";
import type { TourLister } from "../../application/tours/ListTours";
import type {
  SourceWorkspace,
  TourSourceBindingStore,
} from "../../application/tours/TourSourceBinding";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import { tourScopeChoices, TourScope, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";

export interface PlayTourUserInterface {
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
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

export type PlayableTourSummary = MaybeHealthyTourSummary;

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
    const scope = await this.userInterface.chooseScope(tourScopeChoices);
    if (!scope) {
      return;
    }
    try {
      const tours = await this.listPlayableTours(scope);
      if (tours.length === 0) {
        await this.userInterface.showInformation(`No ${scope} tours found.`);
        return;
      }
      const tour = await this.userInterface.chooseTour(tours);
      if (tour) {
        await this.play(scope, tour);
      }
    } catch (error) {
      await this.reportFailure(scope, error);
    }
  }

  /**
   * Plays a tour the reader picked somewhere else, such as a node in the flow diagram. The
   * binding and health rules are the same ones the picker applies.
   */
  public async executeForTour(
    scope: TourScope,
    id: string,
    startAt?: PlaybackPosition,
  ): Promise<void> {
    try {
      const tour = (await this.listPlayableTours(scope)).find((candidate) => candidate.id === id);
      if (!tour) {
        throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
      }
      await this.play(scope, tour, startAt);
    } catch (error) {
      await this.reportFailure(scope, error);
    }
  }

  private listPlayableTours(scope: TourScope): Promise<readonly PlayableTourSummary[]> {
    return scope === TourScope.Personal
      ? this.listTours.execute(scope)
      : this.listToursWithHealth.execute(scope);
  }

  private async play(
    scope: TourScope,
    tour: PlayableTourSummary,
    startAt?: PlaybackPosition,
  ): Promise<void> {
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
    await this.playTour.execute(scope, tour.id, startAt);
  }

  private async reportFailure(scope: TourScope, error: unknown): Promise<void> {
    this.logger.error(`Failed to play ${scope} tour`, error);
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    await this.userInterface.showError(`Could not play tour: ${message}`);
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
