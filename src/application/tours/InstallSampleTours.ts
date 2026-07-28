import type { TourAnchor } from "../../domain/tour/TourAnchor";
import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";

export interface ScopedTourSample {
  readonly scope: TourScope;
  readonly tour: TourDocument;
  readonly anchors: readonly TourAnchor[];
}

export interface TourSampleCatalog {
  loadSamples(): Promise<readonly ScopedTourSample[]>;
}

export interface InstalledTourSample {
  readonly scope: TourScope;
  readonly tourId: string;
  readonly installed: boolean;
}

interface SampleInstallPlan {
  readonly sample: ScopedTourSample;
  readonly existingTour: TourDocument | undefined;
  readonly missingAnchors: readonly TourAnchor[];
}

export class InstallSampleTours {
  public constructor(
    private readonly catalog: TourSampleCatalog,
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
  ) {}

  public async execute(): Promise<InstalledTourSample[]> {
    const plans: SampleInstallPlan[] = [];
    for (const sample of await this.catalog.loadSamples()) {
      const storage = this.storageResolver.resolve(sample.scope);
      const registry = this.anchorRegistryResolver.resolve(sample.scope);
      const [existingTour, existingAnchors] = await Promise.all([
        storage.loadTour(sample.tour.id),
        registry.loadAnchors(),
      ]);
      if (existingTour && !isDeepStrictEqual(existingTour, sample.tour)) {
        throw new Error(
          `Tour id '${sample.tour.id}' already exists with different content in ${sample.scope} storage.`,
        );
      }
      const anchorsById = new Map(existingAnchors.map((anchor) => [anchor.id, anchor]));
      for (const anchor of sample.anchors) {
        const existing = anchorsById.get(anchor.id);
        if (existing && !isDeepStrictEqual(existing, anchor)) {
          throw new Error(
            `Anchor id '${anchor.id}' already exists with different content in ${sample.scope} storage.`,
          );
        }
      }
      plans.push({
        sample,
        existingTour,
        missingAnchors: sample.anchors.filter((anchor) => !anchorsById.has(anchor.id)),
      });
    }

    const results: InstalledTourSample[] = [];
    for (const plan of plans) {
      const storage = this.storageResolver.resolve(plan.sample.scope);
      const registry = this.anchorRegistryResolver.resolve(plan.sample.scope);
      for (const anchor of plan.missingAnchors) {
        await registry.saveAnchor(anchor);
      }
      if (!plan.existingTour) {
        await storage.saveTour(plan.sample.tour);
      }
      results.push({
        scope: plan.sample.scope,
        tourId: plan.sample.tour.id,
        installed: plan.existingTour === undefined,
      });
    }
    return results;
  }
}
import { isDeepStrictEqual } from "node:util";
