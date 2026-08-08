import type { TourDocument } from "../../domain/tour/TourDocument";
import type { TourPlayer } from "./TourPlayer";

export type PlaybackAction = "previous" | "next" | "goto" | "exit";

export interface PlaybackPosition {
  readonly stepIndex: number;
  readonly hopIndex: number;
}

/** True when the position addresses a hop that exists, so `gotoHop` cannot throw. */
export function isPlayablePosition(tour: TourDocument, position: PlaybackPosition): boolean {
  return Boolean(tour.steps[position.stepIndex]?.hops[position.hopIndex]);
}

/**
 * Applies one action to the player. A `goto` without a target leaves the position alone,
 * which is what happens when a jump is requested and then superseded.
 */
export function applyPlaybackAction(
  player: TourPlayer,
  action: PlaybackAction,
  target?: PlaybackPosition,
): void {
  if (action === "previous") {
    player.previous();
  } else if (action === "next") {
    player.next();
  } else if (action === "goto") {
    if (target) {
      player.gotoHop(target.stepIndex, target.hopIndex);
    }
  } else {
    player.exit();
  }
}
