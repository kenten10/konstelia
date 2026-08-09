import type {
  RepairAnchor,
  RepairAnchorCandidate,
  RepairAnchorPreparation,
} from "../../application/anchors/RepairAnchor";
import type { ProposeAnchorInput } from "../../application/anchors/CreateAnchor";
import type { AnchorRepairAuthorizer } from "../../application/anchors/AuthorizeAnchorRepair";
import { formatAnchorReference } from "../../domain/tour/AnchorReference";
import type { TourScope} from "../../domain/tour/TourScope";
import { anchorScopeChoices, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";
import type { SourceWorkspace } from "../../application/tours/TourSourceBinding";

export interface RepairAnchorUserInterface {
  captureSelection(): Promise<ProposeAnchorInput | undefined>;
  getCurrentSourceWorkspace(): SourceWorkspace | undefined;
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
  chooseAnchor(candidates: readonly RepairAnchorCandidate[]): Promise<RepairAnchorCandidate | undefined>;
  confirmRebind(
    candidate: RepairAnchorCandidate,
    preparation: RepairAnchorPreparation,
  ): Promise<boolean>;
  showInformation(message: string): Promise<void>;
  showSuccess(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export class RepairAnchorCommand {
  public constructor(
    private readonly repairAnchor: RepairAnchor,
    private readonly authorizer: AnchorRepairAuthorizer,
    private readonly userInterface: RepairAnchorUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    try {
      const selection = await this.userInterface.captureSelection();
      if (!selection) return;
      const scope = await this.userInterface.chooseScope(anchorScopeChoices);
      if (!scope) return;
      const preparation = await this.repairAnchor.prepare(scope, selection);
      if (preparation.candidates.length === 0) {
        await this.userInterface.showInformation(
          `No anchors are available in ${scope} storage.`,
        );
        return;
      }
      const candidate = await this.userInterface.chooseAnchor(preparation.candidates);
      if (!candidate) return;
      await this.authorizer.assertAllowed(
        scope,
        candidate.anchor.id,
        this.userInterface.getCurrentSourceWorkspace()?.uri,
      );
      if (!(await this.userInterface.confirmRebind(candidate, preparation))) {
        return;
      }
      await this.authorizer.assertAllowed(
        scope,
        candidate.anchor.id,
        this.userInterface.getCurrentSourceWorkspace()?.uri,
      );
      const anchor = await this.repairAnchor.rebind(
        scope,
        candidate.anchor.id,
        preparation.proposal,
      );
      await this.userInterface.showSuccess(
        `Rebound anchor '${anchor.id}' to ${formatAnchorReference(anchor)}.`,
      );
      this.logger.info(`Rebound anchor ${anchor.id} in ${scope} storage.`);
    } catch (error) {
      this.logger.error("Failed to repair anchor", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not repair anchor: ${message}`);
    }
  }
}
