import type { AnchorProposal, CreateAnchor, ProposeAnchorInput } from "../../application/anchors/CreateAnchor";
import { formatAnchorReference } from "../../domain/tour/AnchorReference";
import type { TourAnchor } from "../../domain/tour/TourAnchor";
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

/**
 * Turns the current selection into an anchor in a known scope. The command asks for the scope
 * first; the tour editor already knows it from the tour being edited.
 */
export class CreateAnchorAuthor {
  public constructor(
    private readonly createAnchor: CreateAnchor,
    private readonly userInterface: Omit<CreateAnchorUserInterface, "chooseScope">,
    private readonly logger: Logger,
  ) {}

  /** Captures the selection and confirms it, before any scope is known. */
  public async propose(): Promise<AnchorProposal | undefined> {
    const selection = await this.userInterface.captureSelection();
    if (!selection) {
      return undefined;
    }
    const proposal = this.createAnchor.propose(selection);
    if (proposal.snapped && !(await this.userInterface.confirmSnappedTarget(proposal))) {
      return undefined;
    }
    return proposal;
  }

  public async save(scope: TourScope, proposal: AnchorProposal): Promise<TourAnchor | undefined> {
    const id = await this.userInterface.askForId(proposal.suggestedId);
    if (id === undefined) {
      return undefined;
    }
    const anchor = await this.createAnchor.save(scope, id, proposal);
    this.logger.info(`Created anchor ${anchor.id} in ${scope} storage.`);
    return anchor;
  }

  public async createInScope(scope: TourScope): Promise<TourAnchor | undefined> {
    const proposal = await this.propose();
    return proposal ? this.save(scope, proposal) : undefined;
  }
}

export class CreateAnchorCommand {
  private readonly author: CreateAnchorAuthor;

  public constructor(
    createAnchor: CreateAnchor,
    private readonly userInterface: CreateAnchorUserInterface,
    private readonly logger: Logger,
  ) {
    this.author = new CreateAnchorAuthor(createAnchor, userInterface, logger);
  }

  public async execute(): Promise<void> {
    try {
      const proposal = await this.author.propose();
      if (!proposal) {
        return;
      }
      const scope = await this.userInterface.chooseScope(scopeChoices);
      if (!scope) {
        return;
      }
      const anchor = await this.author.save(scope, proposal);
      if (!anchor) {
        return;
      }
      await this.userInterface.showSuccess(
        `Created anchor '${anchor.id}' for ${formatAnchorReference(anchor)}.`,
      );
    } catch (error) {
      this.logger.error("Failed to create anchor", error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not create anchor: ${message}`);
    }
  }
}
