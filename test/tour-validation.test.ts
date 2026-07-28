import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import {
  validateTourCatalog,
  validateTourDocument,
} from "../src/domain/tour/TourValidation";

describe("validateTourDocument", () => {
  it("accepts a minimal newly created tour", () => {
    assert.deepEqual(validateTourDocument({ id: "my-tour", title: "My Tour", steps: [] }), []);
  });

  it("validates hop summaries, anchors, and primary emphasis", () => {
    const issues = validateTourDocument({
      id: "invalid",
      title: "Invalid",
      steps: [{
        id: "step",
        title: "Step",
        hops: [{
          summary: "two\nlines",
          anchors: [{ ref: "anchor", emphasis: "secondary" }],
        }],
      }],
    });

    assert.ok(issues.some((issue) => issue.message === "summary must be a single line."));
    assert.ok(issues.some((issue) => issue.message.includes("exactly one primary")));
  });

  it("rejects duplicate step IDs and malformed links", () => {
    const issues = validateTourDocument({
      id: "invalid",
      title: "Invalid",
      steps: [
        { id: "same", title: "One", hops: [], links: [{ to: "bad", label: "Bad" }] },
        { id: "same", title: "Two", hops: [] },
      ],
    });

    assert.ok(issues.some((issue) => issue.message === "Duplicate step id 'same'."));
    assert.ok(issues.some((issue) => issue.message.includes("tourId#stepId")));
  });
});

describe("validateTourCatalog", () => {
  it("detects duplicate IDs, missing links, and prerequisite cycles", () => {
    const first: TourDocument = {
      id: "first",
      title: "First",
      prerequisites: ["second"],
      steps: [{
        id: "entry",
        title: "Entry",
        hops: [],
        links: [{ to: "missing#step", label: "Missing" }],
      }],
    };
    const second: TourDocument = {
      id: "second",
      title: "Second",
      prerequisites: ["first"],
      steps: [],
    };
    const duplicate: TourDocument = { id: "duplicate", title: "Duplicate", steps: [] };
    const duplicateAgain: TourDocument = { id: "duplicate", title: "Duplicate Again", steps: [] };

    const issues = validateTourCatalog([
      { key: "first", tour: first },
      { key: "second", tour: second },
      { key: "duplicate", tour: duplicate },
      { key: "duplicate-again", tour: duplicateAgain },
    ]);

    assert.equal(issues.filter((issue) => issue.message === "Duplicate tour id 'duplicate'.").length, 2);
    assert.ok(issues.some((issue) => issue.message === "Link target 'missing#step' does not exist."));
    assert.ok(issues.some((issue) => issue.message.includes("Circular prerequisites")));
  });

  it("accepts valid cross-tour references", () => {
    const overview: TourDocument = {
      id: "overview",
      title: "Overview",
      steps: [{ id: "entry", title: "Entry", hops: [] }],
    };
    const detail: TourDocument = {
      id: "detail",
      title: "Detail",
      prerequisites: ["overview"],
      steps: [{
        id: "detail",
        title: "Detail",
        hops: [],
        links: [{ to: "overview#entry", label: "Overview" }],
      }],
    };

    assert.deepEqual(validateTourCatalog([
      { key: "overview", tour: overview },
      { key: "detail", tour: detail },
    ]), []);
  });
});
