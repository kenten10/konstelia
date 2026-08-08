import type { SemanticAnchorAdapter } from "../anchors/SemanticAnchorAdapter";
import { AnchorHealth } from "../../domain/tour/TourAnchor";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourSummary } from "../../infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";
import { ValidateTourProject } from "./ValidateTourProject";

export interface TourSourceReader {
  readSource(relativeFile: string): Promise<string>;
}

export interface TourHealthSummary extends TourSummary {
  readonly health: AnchorHealth;
  readonly reasons: readonly string[];
}

/** A listed tour whose health may not have been assessed yet, as for unbound personal tours. */
export interface MaybeHealthyTourSummary extends TourSummary {
  readonly health?: AnchorHealth;
  readonly reasons?: readonly string[];
}

export interface TourHealthLister {
  execute(scope: TourScope): Promise<TourHealthSummary[]>;
}

export class ListToursWithHealth implements TourHealthLister {
  private readonly validator: ValidateTourProject;

  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
    private readonly sourceReader: TourSourceReader,
    adapter: SemanticAnchorAdapter,
  ) {
    this.validator = new ValidateTourProject(adapter);
  }

  public async execute(scope: TourScope): Promise<TourHealthSummary[]> {
    const files = await this.storageResolver.resolve(scope).scanTours();
    const anchors = await this.anchorRegistryResolver.resolve(scope).loadAnchors();
    const report = await this.validator.execute({
      root: scope,
      tours: files.map((file) => ({
        file: file.location.uri.toString(),
        tour: file.tour,
        issues: file.issues,
      })),
      anchors,
      readSource: (file) => this.sourceReader.readSource(file),
    });
    const anchorResults = new Map(report.anchors.map((anchor) => [anchor.id, anchor]));
    const healthByFile = new Map(report.tours.map((tour) => [tour.file, tour]));
    return files.flatMap((file) => {
      if (!file.tour) {
        return [];
      }
      const validation = healthByFile.get(file.location.uri.toString());
      const reasons = new Set(validation?.issues.map((issue) => issue.message) ?? []);
      for (const step of file.tour.steps) {
        for (const hop of step.hops) {
          for (const reference of hop.anchors) {
            const anchor = anchorResults.get(reference.ref);
            if (!anchor) {
              reasons.add(`Anchor '${reference.ref}' does not exist.`);
            } else if (anchor.health !== AnchorHealth.Healthy) {
              reasons.add(`${reference.ref}: ${anchor.reason ?? anchor.health}`);
            }
          }
        }
      }
      return [{
        id: file.tour.id,
        title: file.tour.title,
        location: file.location,
        health: validation?.health ?? AnchorHealth.Broken,
        reasons: [...reasons],
      }];
    }).sort((left, right) => left.title.localeCompare(right.title));
  }
}
