import type {
  AnchorRepairTarget,
  DiscoverAnchorRepairs,
} from "../../application/anchors/DiscoverAnchorRepairs";
import type { RepairAnchor } from "../../application/anchors/RepairAnchor";
import type { AnchorRepairAuthorizer } from "../../application/anchors/AuthorizeAnchorRepair";
import { formatAnchorReference } from "../../domain/tour/AnchorReference";
import type { TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourScope} from "../../domain/tour/TourScope";
import { anchorScopeChoices, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";
import type { SourceWorkspace } from "../../application/tours/TourSourceBinding";

export interface DiscoverAnchorRepairsUserInterface {
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
  getCurrentSourceWorkspace(): SourceWorkspace | undefined;
  chooseStoredAnchor(anchors: readonly TourAnchor[]): Promise<TourAnchor | undefined>;
  chooseRepairTarget(targets: readonly AnchorRepairTarget[]): Promise<AnchorRepairTarget | undefined>;
  confirmDiscoveredRebind(anchor: TourAnchor, target: AnchorRepairTarget): Promise<boolean>;
  showInformation(message: string): Promise<void>;
  showSuccess(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export class DiscoverAnchorRepairsCommand {
  public constructor(
    private readonly discoverRepairs: DiscoverAnchorRepairs,
    private readonly repairAnchor: RepairAnchor,
    private readonly authorizer: AnchorRepairAuthorizer,
    private readonly userInterface: DiscoverAnchorRepairsUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    try {
      const scope = await this.userInterface.chooseScope(anchorScopeChoices);
      if (!scope) return;
      const anchors = await this.discoverRepairs.listAnchors(scope);
      if (anchors.length === 0) {
        await this.userInterface.showInformation(`No anchors are available in ${scope} storage.`);
        return;
      }
      const anchor = await this.userInterface.chooseStoredAnchor(anchors);
      if (!anchor) return;
      await this.authorizer.assertAllowed(
        scope,
        anchor.id,
        this.userInterface.getCurrentSourceWorkspace()?.uri,
      );
      const discovery = await this.discoverRepairs.execute(scope, anchor.id);
      if (discovery.cancelled || discovery.skippedFiles > 0) {
        const details = [
          discovery.cancelled ? "The search was cancelled and results are partial." : undefined,
          discovery.skippedFiles > 0
            ? `${discovery.skippedFiles} source file(s) could not be read.`
            : undefined,
        ].filter((detail): detail is string => detail !== undefined).join(" ");
        await this.userInterface.showInformation(details);
      }
      if (discovery.targets.length === 0) {
        await this.userInterface.showInformation(
          `No repair candidates were found for anchor '${anchor.id}'.`,
        );
        return;
      }
      const target = await this.userInterface.chooseRepairTarget(discovery.targets);
      if (!target || !(await this.userInterface.confirmDiscoveredRebind(anchor, target))) return;
      await this.authorizer.assertAllowed(
        scope,
        anchor.id,
        this.userInterface.getCurrentSourceWorkspace()?.uri,
      );
      const replacement = await this.repairAnchor.rebind(scope, anchor.id, target.proposal);
      await this.userInterface.showSuccess(
        `Rebound anchor '${replacement.id}' to ${formatAnchorReference(replacement)}.`,
      );
      this.logger.info(`Rebound anchor ${replacement.id} from a discovered candidate in ${scope} storage.`);
    } catch (error) {
      this.logger.error("Failed to discover anchor repairs", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not discover anchor repairs: ${message}`);
    }
  }
}
