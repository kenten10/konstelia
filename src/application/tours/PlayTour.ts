import type { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistryResolver } from "./TourAnchorRegistry";
import type { TourPlayback } from "./TourPlayback";

export interface PlayTourUseCase {
  execute(scope: TourScope, id: string): Promise<void>;
}

export class PlayTour implements PlayTourUseCase {
  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistryResolver: TourAnchorRegistryResolver,
    private readonly playback: TourPlayback,
  ) {}

  public async execute(scope: TourScope, id: string): Promise<void> {
    const tour = await this.storageResolver.resolve(scope).loadTour(id);
    if (!tour) {
      throw new Error(`Tour '${id}' was not found in ${scope} storage.`);
    }
    const anchors = await this.anchorRegistryResolver.resolve(scope).loadAnchors();
    await this.playback.start(tour, anchors);
  }
}
