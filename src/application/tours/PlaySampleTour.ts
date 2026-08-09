import { TourScope } from "../../domain/tour/TourScope";
import type { TourStorageResolver } from "../../infrastructure/storage/TourStorageResolver";
import type { TourAnchorRegistry } from "./TourAnchorRegistry";
import type { TourPlayback } from "./TourPlayback";

export interface PlaySampleTourUseCase {
  execute(): Promise<void>;
}

export class PlaySampleTour implements PlaySampleTourUseCase {
  public constructor(
    private readonly storageResolver: TourStorageResolver,
    private readonly anchorRegistry: TourAnchorRegistry,
    private readonly playback: TourPlayback,
  ) {}

  public async execute(): Promise<void> {
    const tour = await this.storageResolver.resolve(TourScope.Repository).loadTour("sample-tour");
    if (!tour) {
      throw new Error("Sample tour not found in repository storage.");
    }
    const anchors = await this.anchorRegistry.loadAnchors();
    await this.playback.start({ tour, anchors, scope: TourScope.Repository });
  }
}
