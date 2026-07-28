import type { PlaySampleTourUseCase } from "../../application/tours/PlaySampleTour";
import type { Logger } from "../../shared/logging/Logger";

export interface PlaySampleTourUserInterface {
  showError(message: string): Promise<void>;
}

export class PlaySampleTourCommand {
  public constructor(
    private readonly playSampleTour: PlaySampleTourUseCase,
    private readonly userInterface: PlaySampleTourUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    try {
      await this.playSampleTour.execute();
    } catch (error) {
      this.logger.error("Failed to play sample tour", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not play sample tour: ${message}`);
    }
  }
}
