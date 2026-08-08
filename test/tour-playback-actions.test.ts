import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyPlaybackAction,
  isPlayablePosition,
} from "../src/application/tours/TourPlaybackActions";
import { TourPlayer } from "../src/application/tours/TourPlayer";
import type { TourDocument } from "../src/domain/tour/TourDocument";

const tour: TourDocument = {
  id: "tour",
  title: "Tour",
  steps: [
    {
      id: "first",
      title: "First",
      hops: [
        { summary: "one", anchors: [{ ref: "a", emphasis: "primary" }] },
        { summary: "two", anchors: [{ ref: "b", emphasis: "primary" }] },
      ],
    },
    {
      id: "second",
      title: "Second",
      hops: [{ summary: "three", anchors: [{ ref: "c", emphasis: "primary" }] }],
    },
  ],
};

describe("isPlayablePosition", () => {
  it("accepts hops that exist and rejects everything else", () => {
    assert.equal(isPlayablePosition(tour, { stepIndex: 1, hopIndex: 0 }), true);
    assert.equal(isPlayablePosition(tour, { stepIndex: 1, hopIndex: 1 }), false);
    assert.equal(isPlayablePosition(tour, { stepIndex: 5, hopIndex: 0 }), false);
    assert.equal(isPlayablePosition(tour, { stepIndex: -1, hopIndex: 0 }), false);
  });

  it("guards every position gotoHop would reject", () => {
    const player = new TourPlayer(tour);
    for (const stepIndex of [-1, 0, 1, 2]) {
      for (const hopIndex of [-1, 0, 1, 2]) {
        if (isPlayablePosition(tour, { stepIndex, hopIndex })) {
          assert.doesNotThrow(() => player.gotoHop(stepIndex, hopIndex));
        }
      }
    }
  });
});

describe("applyPlaybackAction", () => {
  it("jumps to the requested hop", () => {
    const player = new TourPlayer(tour);

    applyPlaybackAction(player, "goto", { stepIndex: 1, hopIndex: 0 });

    assert.deepEqual(
      [player.getState().stepIndex, player.getState().hopIndex],
      [1, 0],
    );
  });

  it("stays put when a jump has no target", () => {
    const player = new TourPlayer(tour);
    player.next();

    applyPlaybackAction(player, "goto", undefined);

    assert.deepEqual(
      [player.getState().stepIndex, player.getState().hopIndex],
      [0, 1],
    );
  });

  it("ignores a stale target on every other action", () => {
    const player = new TourPlayer(tour);

    applyPlaybackAction(player, "next", { stepIndex: 1, hopIndex: 0 });

    assert.deepEqual(
      [player.getState().stepIndex, player.getState().hopIndex],
      [0, 1],
    );
  });

  it("moves back and exits", () => {
    const player = new TourPlayer(tour);
    player.gotoHop(1, 0);

    applyPlaybackAction(player, "previous");
    assert.deepEqual([player.getState().stepIndex, player.getState().hopIndex], [0, 1]);

    applyPlaybackAction(player, "exit");
    assert.equal(player.getState().status, "exited");
  });
});
