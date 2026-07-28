import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourAnchor } from "../../domain/tour/TourAnchor";
import { FeatureUnavailableError } from "../../shared/errors/KonsteliaError";

export interface TourPlayback {
  start(tour: TourDocument, anchors: readonly TourAnchor[]): Promise<void>;
}

export class PendingTourPlayback implements TourPlayback {
  public start(tour: TourDocument, anchors: readonly TourAnchor[]): Promise<void> {
    return Promise.reject(
      new FeatureUnavailableError(
        `Tour playback for '${tour.id}' with ${anchors.length} anchors is planned but not implemented yet.`,
      ),
    );
  }
}
