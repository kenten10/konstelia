import type { InstallSampleTours } from "../../application/tours/InstallSampleTours";
import type {
  SourceWorkspace,
  TourSourceBindingStore,
} from "../../application/tours/TourSourceBinding";
import { TourScope } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";

export interface InstallSampleToursUserInterface {
  getCurrentSourceWorkspace(): SourceWorkspace | undefined;
  isBundledSampleWorkspace(workspace: SourceWorkspace): boolean;
  openBundledSampleWorkspace(): Promise<boolean>;
  showSuccess(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export class InstallSampleToursCommand {
  public constructor(
    private readonly installSampleTours: InstallSampleTours,
    private readonly sourceBindings: TourSourceBindingStore,
    private readonly userInterface: InstallSampleToursUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const sourceWorkspace = this.userInterface.getCurrentSourceWorkspace();
    if (!sourceWorkspace || !this.userInterface.isBundledSampleWorkspace(sourceWorkspace)) {
      const openingWorkspace = await this.userInterface.openBundledSampleWorkspace();
      if (!openingWorkspace) {
        await this.userInterface.showError(
          "Sample tours can only be installed in the bundled Konstelia workspace.",
        );
      }
      return;
    }
    try {
      const results = await this.installSampleTours.execute();
      for (const result of results) {
        if (result.scope === TourScope.Personal) {
          await this.sourceBindings.set(result.scope, result.tourId, sourceWorkspace.uri);
        }
      }
      const installedCount = results.filter((result) => result.installed).length;
      const message =
        installedCount > 0
          ? `Installed ${installedCount} sample tours. Use Konstelia: Play Tour to open them.`
          : "Sample tours are already installed.";
      await this.userInterface.showSuccess(message);
      this.logger.info(`Sample tours ready for ${sourceWorkspace.uri}.`);
    } catch (error) {
      this.logger.error("Failed to install sample tours", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not install sample tours: ${message}`);
    }
  }
}
