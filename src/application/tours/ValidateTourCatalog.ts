import type { TourScope } from "../../domain/tour/TourScope";
import {
  validateTourCatalog,
  type TourValidationIssue,
} from "../../domain/tour/TourValidation";
import type { TourLocation } from "../../infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";

export interface TourFileValidation {
  location: TourLocation;
  issues: readonly TourValidationIssue[];
}

export class ValidateTourCatalog {
  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
  ) {}

  public async execute(scope: TourScope): Promise<TourFileValidation[]> {
    const files = await this.storageResolver.resolve(scope).scanTours();
    const issuesByKey = new Map(
      files.map((file) => [file.location.uri.toString(), [...file.issues]]),
    );
    const validFiles = files.flatMap((file) =>
      file.tour
        ? [{ key: file.location.uri.toString(), tour: file.tour }]
        : [],
    );
    for (const issue of validateTourCatalog(validFiles)) {
      issuesByKey.get(issue.key)?.push({ path: issue.path, message: issue.message });
    }
    const anchorIds = new Set(
      (await this.anchorRegistryResolver.resolve(scope).loadAnchors()).map((anchor) => anchor.id),
    );
    for (const file of files) {
      if (!file.tour) {
        continue;
      }
      for (const [stepIndex, step] of file.tour.steps.entries()) {
        for (const [hopIndex, hop] of step.hops.entries()) {
          for (const [anchorIndex, anchor] of hop.anchors.entries()) {
            if (!anchorIds.has(anchor.ref)) {
              issuesByKey.get(file.location.uri.toString())?.push({
                path: `steps[${stepIndex}].hops[${hopIndex}].anchors[${anchorIndex}].ref`,
                message: `Anchor '${anchor.ref}' does not exist in ${scope} storage.`,
              });
            }
          }
        }
      }
    }
    return files.map((file) => ({
      location: file.location,
      issues: issuesByKey.get(file.location.uri.toString()) ?? [],
    }));
  }
}
