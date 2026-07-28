import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessTourAnchors } from "../src/application/tours/AssessTourAnchors";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";

const tour: TourDocument = {
  id: "health",
  title: "Health",
  steps: [{
    id: "entry",
    title: "Entry",
    hops: [{
      summary: "Inspect anchors",
      anchors: [
        { ref: "primary", emphasis: "primary" },
        { ref: "secondary", emphasis: "secondary" },
      ],
    }],
  }],
};

describe("assessTourAnchors", () => {
  it("blocks playback when a primary anchor is broken", () => {
    const result = assessTourAnchors(tour, new Map([
      ["primary", { health: AnchorHealth.Broken, reason: "missing symbol" }],
      ["secondary", { health: AnchorHealth.Healthy }],
    ]));

    assert.equal(result.health, AnchorHealth.Broken);
    assert.equal(result.blockingIssues[0]?.anchorId, "primary");
    assert.deepEqual(result.warnings, []);
  });

  it("continues with drifted health when only a secondary anchor is broken", () => {
    const result = assessTourAnchors(tour, new Map([
      ["primary", { health: AnchorHealth.Healthy }],
      ["secondary", { health: AnchorHealth.Broken, reason: "missing symbol" }],
    ]));

    assert.equal(result.health, AnchorHealth.Drifted);
    assert.deepEqual(result.blockingIssues, []);
    assert.equal(result.warnings[0]?.anchorId, "secondary");
  });

  it("treats a missing registry entry according to its emphasis", () => {
    const result = assessTourAnchors(tour, new Map([
      ["primary", { health: AnchorHealth.Healthy }],
    ]));

    assert.equal(result.health, AnchorHealth.Drifted);
    assert.match(result.warnings[0]?.reason ?? "", /missing from the registry/);
  });
});
