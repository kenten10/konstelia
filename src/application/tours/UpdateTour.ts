import { normalizeTourDocument, type TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import {
  validateTourCatalog,
  validateTourDocument,
  type CatalogTour,
  type TourValidationIssue,
} from "../../domain/tour/TourValidation";
import type { TourLocation } from "../../infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";

export interface UpdateTourInput {
  scope: TourScope;
  tour: TourDocument;
}

export interface UpdateTourResult {
  issues: readonly TourValidationIssue[];
  location?: TourLocation;
}

export interface UpdateTourUseCase {
  validate(input: UpdateTourInput): Promise<readonly TourValidationIssue[]>;
  execute(input: UpdateTourInput): Promise<UpdateTourResult>;
}

/**
 * Writes an edited tour back to its own file. Authoring surfaces send whole documents, so the
 * same schema, anchor, and catalog rules that guard hand-written YAML are applied here before
 * anything is persisted.
 */
export class UpdateTour implements UpdateTourUseCase {
  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
  ) {}

  public async validate(input: UpdateTourInput): Promise<readonly TourValidationIssue[]> {
    return (await this.review(input)).issues;
  }

  public async execute(input: UpdateTourInput): Promise<UpdateTourResult> {
    const { issues, tour } = await this.review(input);
    if (issues.length > 0) {
      return { issues };
    }
    const location = await this.storageResolver.resolve(input.scope).updateTour(tour);
    return { issues, location };
  }

  private async review(
    input: UpdateTourInput,
  ): Promise<{ issues: readonly TourValidationIssue[]; tour: TourDocument }> {
    const structural = validateTourDocument(input.tour);
    if (structural.length > 0) {
      return { issues: structural, tour: input.tour };
    }
    const tour = normalizeTourDocument(input.tour);
    const files = await this.storageResolver.resolve(input.scope).scanTours();
    const target = files.find((file) => file.tour?.id === tour.id);
    if (!target) {
      throw new Error(`Tour '${tour.id}' was not found in ${input.scope} storage.`);
    }
    const anchors = await this.anchorRegistryResolver.resolve(input.scope).loadAnchors();
    const knownAnchors = new Set(anchors.map((anchor) => anchor.id));
    const issues = [...missingAnchorIssues(tour, knownAnchors)];

    const key = target.location.uri.toString();
    const entries: CatalogTour[] = files.flatMap((file) => {
      const fileKey = file.location.uri.toString();
      if (fileKey === key) {
        return [{ key, tour }];
      }
      return file.tour ? [{ key: fileKey, tour: file.tour }] : [];
    });
    for (const issue of validateTourCatalog(entries)) {
      if (issue.key === key) {
        issues.push({ path: issue.path, message: issue.message });
      }
    }
    return { issues, tour };
  }
}

function missingAnchorIssues(
  tour: TourDocument,
  knownAnchors: ReadonlySet<string>,
): TourValidationIssue[] {
  const issues: TourValidationIssue[] = [];
  for (const [stepIndex, step] of tour.steps.entries()) {
    for (const [hopIndex, hop] of step.hops.entries()) {
      for (const [anchorIndex, anchor] of hop.anchors.entries()) {
        if (!knownAnchors.has(anchor.ref)) {
          issues.push({
            path: `steps[${stepIndex}].hops[${hopIndex}].anchors[${anchorIndex}].ref`,
            message: `Anchor '${anchor.ref}' does not exist in the registry.`,
          });
        }
      }
    }
  }
  return issues;
}
