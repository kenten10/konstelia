import type { AnchorProposal, CreateAnchor, ProposeAnchorInput } from "../../application/anchors/CreateAnchor";
import { formatAnchorReference } from "../../domain/tour/AnchorReference";
import { TourScope } from "../../domain/tour/TourScope";
import type { Logger } from "../../shared/logging/Logger";

export interface AnchorScopeChoice {
  label: string;
  description: string;
  scope: TourScope;
}

export interface CreateAnchorUserInterface {
  captureSelection(): Promise<ProposeAnchorInput | undefined>;
  confirmSnappedTarget(proposal: AnchorProposal): Promise<boolean>;
  chooseScope(choices: readonly AnchorScopeChoice[]): Promise<TourScope | undefined>;
  askForId(suggestedId: string): Promise<string | undefined>;
  showSuccess(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

const scopeChoices: readonly AnchorScopeChoice[] = [
  { label: "Personal", description: "Private to your VS Code user", scope: TourScope.Personal },
  { label: "Workspace", description: "Private to this workspace", scope: TourScope.Workspace },
  { label: "Repository", description: "Shared with repository collaborators", scope: TourScope.Repository },
];

export class CreateAnchorCommand {
  public constructor(
    private readonly createAnchor: CreateAnchor,
    private readonly userInterface: CreateAnchorUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    try {
      const selection = await this.userInterface.captureSelection();
      if (!selection) {
        return;
      }
      const proposal = this.createAnchor.propose(selection);
      if (proposal.snapped && !(await this.userInterface.confirmSnappedTarget(proposal))) {
        return;
      }
      const scope = await this.userInterface.chooseScope(scopeChoices);
      if (!scope) {
        return;
      }
      const id = await this.userInterface.askForId(proposal.suggestedId);
      if (id === undefined) {
        return;
      }
      const anchor = await this.createAnchor.save(scope, id, proposal);
      await this.userInterface.showSuccess(
        `Created anchor '${anchor.id}' for ${formatAnchorReference(anchor)}.`,
      );
      this.logger.info(`Created anchor ${anchor.id} in ${scope} storage.`);
    } catch (error) {
      this.logger.error("Failed to create anchor", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not create anchor: ${message}`);
    }
  }
}
