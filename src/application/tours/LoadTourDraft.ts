import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";

export interface TourAnchorChoice {
  readonly id: string;
  readonly file: string;
  readonly symbol: string;
}

export interface TourStepTarget {
  readonly target: string;
  readonly tourTitle: string;
  readonly stepTitle: string;
}

export interface TourDraft {
  readonly scope: TourScope;
  readonly tour: TourDocument;
  readonly anchors: readonly TourAnchorChoice[];
  readonly stepTargets: readonly TourStepTarget[];
  readonly tourIds: readonly string[];
}

export interface LoadTourDraftUseCase {
  execute(scope: TourScope, id: string): Promise<TourDraft>;
}

/** Collects everything the tour editor needs to offer choices instead of free-form text. */
export class LoadTourDraft implements LoadTourDraftUseCase {
  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
  ) {}

  public async execute(scope: TourScope, id: string): Promise<TourDraft> {
    const files = await this.storageResolver.resolve(scope).scanTours();
    const tour = files.find((file) => file.tour?.id === id)?.tour;
    if (!tour) {
      throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
    }
    const anchors = await this.anchorRegistryResolver.resolve(scope).loadAnchors();
    const catalog = files.flatMap((file) => (file.tour ? [file.tour] : []));
    return {
      scope,
      tour,
      anchors: anchors
        .map((anchor) => ({ id: anchor.id, file: anchor.file, symbol: anchor.symbol }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      stepTargets: catalog.flatMap((candidate) =>
        candidate.steps.map((step) => ({
          target: `${candidate.id}#${step.id}`,
          tourTitle: candidate.title,
          stepTitle: step.title,
        })),
      ),
      tourIds: catalog
        .map((candidate) => candidate.id)
        .filter((candidateId) => candidateId !== id)
        .sort((left, right) => left.localeCompare(right)),
    };
  }
}
