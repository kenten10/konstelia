import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourScope } from "../../domain/tour/TourScope";
import type { AnchorHealth, TourAnchor } from "../../domain/tour/TourAnchor";
import { FeatureUnavailableError } from "../../shared/errors/KonsteliaError";
import type { PlaybackPosition } from "./TourPlaybackActions";
import type { TourPlayer } from "./TourPlayer";

export interface TourPlaybackRequest {
  readonly tour: TourDocument;
  readonly anchors: readonly TourAnchor[];
  readonly scope: TourScope;
  /** Opens the tour on a hop other than the first, as the flow diagram does. */
  readonly startAt?: PlaybackPosition;
}

export interface TourPlayback {
  start(request: TourPlaybackRequest): Promise<void>;
}

/** Lets a view ask playback to move without owning the playback loop. */
export interface TourPlaybackController {
  requestGoto(stepIndex: number, hopIndex: number): void;
}

export interface TourPlaybackSession {
  readonly scope: TourScope;
  readonly tour: TourDocument;
  readonly player: TourPlayer;
  readonly anchorHealth: ReadonlyMap<string, AnchorHealth>;
  readonly controller: TourPlaybackController;
}

/**
 * A projection of playback such as the flow diagram. Observers subscribe to the player and
 * never talk to each other, as the tour specification requires.
 */
export interface TourPlaybackObserver {
  onTourStarted(session: TourPlaybackSession): void;
  onTourStopped(): void;
}

export class PendingTourPlayback implements TourPlayback {
  public start({ tour, anchors }: TourPlaybackRequest): Promise<void> {
    return Promise.reject(
      new FeatureUnavailableError(
        `Tour playback for '${tour.id}' with ${anchors.length} anchors is planned but not implemented yet.`,
      ),
    );
  }
}
