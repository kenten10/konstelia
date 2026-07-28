import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TourPlayer } from "../src/application/tours/TourPlayer";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import type { TourDocument, TourHop } from "../src/domain/tour/TourDocument";

const hop = (summary: string): TourHop => ({
  summary,
  anchors: [{ ref: "anchor", emphasis: "primary" }],
});

const tour: TourDocument = {
  id: "player-tour",
  title: "Player Tour",
  steps: [
    { id: "first", title: "First", hops: [hop("one"), hop("two")] },
    { id: "second", title: "Second", hops: [hop("three")] },
  ],
};

describe("TourPlayer", () => {
  it("moves across step boundaries and resets health for each hop", () => {
    const player = new TourPlayer(tour);
    const observed: string[] = [];
    player.subscribe((state) => observed.push(`${state.stepIndex}:${state.hopIndex}:${state.health}`));

    player.setHealth(AnchorHealth.Drifted);
    player.next();
    player.next();

    assert.deepEqual(player.getState(), {
      tourId: "player-tour",
      stepIndex: 1,
      hopIndex: 0,
      health: AnchorHealth.Healthy,
      status: "playing",
    });
    assert.equal(player.canNext(), false);
    assert.equal(player.canPrevious(), true);
    assert.deepEqual(observed, ["0:0:drifted", "0:1:healthy", "1:0:healthy"]);
  });

  it("supports previous, gotoStep, gotoHop, completion, and exit", () => {
    const player = new TourPlayer(tour);

    player.gotoStep(1);
    assert.equal(player.getCurrent()?.hop.summary, "three");
    player.previous();
    assert.equal(player.getCurrent()?.hop.summary, "two");
    player.gotoHop(0, 0);
    assert.equal(player.getCurrent()?.hop.summary, "one");
    player.gotoStep(1);
    assert.equal(player.next().status, "completed");
    assert.equal(player.exit().status, "exited");
  });

  it("rejects empty tours and invalid destinations", () => {
    assert.throws(
      () => new TourPlayer({ id: "empty", title: "Empty", steps: [] }),
      /has no hops/,
    );
    const player = new TourPlayer(tour);
    assert.throws(() => player.gotoHop(3, 0), /does not exist/);
  });
});
