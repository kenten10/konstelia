import type { AnchorLister, TourAnchorChoice } from "../../application/anchors/ListAnchors";
import type { LoadTourDraftUseCase, TourDraft } from "../../application/tours/LoadTourDraft";
import type { TourLister } from "../../application/tours/ListTours";
import type { UpdateTourUseCase } from "../../application/tours/UpdateTour";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope} from "../../domain/tour/TourScope";
import { tourScopeChoices, type TourScopeChoice } from "../../domain/tour/TourScope";
import type { TourValidationIssue } from "../../domain/tour/TourValidation";
import type { TourSummary } from "../../application/tours/TourStorage";
import type { Logger } from "../../shared/logging/Logger";

export interface CreatedTourAnchor {
  readonly id: string;
  readonly anchors: readonly TourAnchorChoice[];
}

/** Creates an anchor in a known scope from whatever the author has selected in a source file. */
export interface TourEditorAnchorAuthor {
  createInScope(scope: TourScope): Promise<{ id: string } | undefined>;
}

/** What the editor surface may ask of the application without knowing about storage. */
export interface TourEditorHost {
  validate(tour: TourDocument): Promise<readonly TourValidationIssue[]>;
  save(tour: TourDocument): Promise<readonly TourValidationIssue[]>;
  /** Returns the new anchor id and the refreshed choices, or undefined when cancelled. */
  createAnchor(): Promise<CreatedTourAnchor | undefined>;
}

export interface EditTourUserInterface {
  chooseScope(choices: readonly TourScopeChoice[]): Promise<TourScope | undefined>;
  chooseTour(tours: readonly TourSummary[]): Promise<TourSummary | undefined>;
  openEditor(draft: TourDraft, host: TourEditorHost): Promise<void>;
  showInformation(message: string): Promise<void>;
  showError(message: string): Promise<void>;
}

export interface TourEditorDependencies {
  readonly updateTour: UpdateTourUseCase;
  readonly listAnchors: AnchorLister;
  readonly anchorAuthor: TourEditorAnchorAuthor;
  readonly logger: Logger;
}

export class EditTourCommand {
  public constructor(
    private readonly listTours: TourLister,
    private readonly loadDraft: LoadTourDraftUseCase,
    private readonly dependencies: TourEditorDependencies,
    private readonly userInterface: EditTourUserInterface,
    private readonly logger: Logger,
  ) {}

  public async execute(): Promise<void> {
    const scope = await this.userInterface.chooseScope(tourScopeChoices);
    if (!scope) {
      return;
    }
    try {
      const tours = await this.listTours.execute(scope);
      if (tours.length === 0) {
        await this.userInterface.showInformation(`No ${scope} tours found.`);
        return;
      }
      const selected = await this.userInterface.chooseTour(tours);
      if (!selected) {
        return;
      }
      const draft = await this.loadDraft.execute(scope, selected.id);
      await this.userInterface.openEditor(
        draft,
        createTourEditorHost(scope, selected.id, this.dependencies),
      );
      this.logger.info(`Opened the tour editor for ${scope} tour '${selected.id}'.`);
    } catch (error) {
      this.logger.error(`Failed to edit ${scope} tour`, error);
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      await this.userInterface.showError(`Could not edit tour: ${message}`);
    }
  }

}

/**
 * Binds an editing surface to exactly one tour. The editor sends whole documents back, so the
 * id it was opened with is the only thing that may decide which file is written.
 */
export function createTourEditorHost(
  scope: TourScope,
  tourId: string,
  dependencies: TourEditorDependencies,
): TourEditorHost {
  const { updateTour, listAnchors, anchorAuthor, logger } = dependencies;
  const requireSameTour = (tour: TourDocument): TourDocument => {
    if (tour.id !== tourId) {
      throw new Error(`This editor edits tour '${tourId}', not '${tour.id}'.`);
    }
    return tour;
  };
  return {
    validate: (tour) => updateTour.validate({ scope, tour: requireSameTour(tour) }),
    save: async (tour) => {
      try {
        const result = await updateTour.execute({ scope, tour: requireSameTour(tour) });
        if (result.issues.length === 0) {
          logger.info(`Saved ${scope} tour '${tourId}'.`);
        } else {
          logger.info(
            `Rejected the edit to ${scope} tour '${tourId}' with ${result.issues.length} issue(s).`,
          );
        }
        return result.issues;
      } catch (error) {
        logger.error(`Failed to save ${scope} tour '${tourId}'`, error);
        throw error;
      }
    },
    createAnchor: async () => {
      try {
        const created = await anchorAuthor.createInScope(scope);
        if (!created) {
          return undefined;
        }
        return { id: created.id, anchors: await listAnchors.execute(scope) };
      } catch (error) {
        logger.error(`Failed to create an anchor for ${scope} tour '${tourId}'`, error);
        throw error;
      }
    },
  };
}
