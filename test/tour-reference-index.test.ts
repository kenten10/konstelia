import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TourReferenceIndex } from "../src/application/tours/TourReferenceIndex";
import type { TourAnchor } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";

const anchors: TourAnchor[] = [
  { id: "login", file: "./src\\auth.ts", symbol: "login" },
  { id: "unused", file: "src/auth.ts", symbol: "unused" },
  { id: "other", file: "src/other.ts", symbol: "other" },
];

const tour: TourDocument = {
  id: "auth-tour",
  title: "Authentication",
  steps: [{
    id: "login-step",
    title: "Login",
    hops: [{
      summary: "Login",
      anchors: [
        { ref: "login", emphasis: "primary" },
        { ref: "other", emphasis: "secondary" },
      ],
    }],
  }],
};

describe("TourReferenceIndex", () => {
  it("indexes referenced anchors from file to tour usage", () => {
    const indexed = new TourReferenceIndex(anchors, [tour]).forFile("src/auth.ts");

    assert.equal(indexed.length, 1);
    assert.equal(indexed[0]?.anchor.id, "login");
    assert.deepEqual(indexed[0]?.usages, [{
      tourId: "auth-tour",
      tourTitle: "Authentication",
      stepId: "login-step",
      hopIndex: 0,
      emphasis: "primary",
    }]);
  });
});
