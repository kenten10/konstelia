import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TourScope } from "../src/domain/tour/TourScope";
import {
  isTourDocumentShape,
  parseTourEditorState,
} from "../src/presentation/editor/TourEditorState";

const midEdit = {
  id: "auth-api",
  title: "Auth API",
  steps: [{
    id: "login",
    title: "Login",
    // A hop the author has not finished: no summary yet and an anchor without a reference.
    hops: [{ summary: "", anchors: [{ ref: "", emphasis: "primary" }] }],
  }],
};

function state(overrides: Record<string, unknown> = {}): unknown {
  return { scope: "repository", tourId: "auth-api", tour: midEdit, dirty: true, ...overrides };
}

describe("parseTourEditorState", () => {
  it("restores work that was never saved, even while it is invalid", () => {
    const target = parseTourEditorState(state());

    assert.equal(target?.scope, TourScope.Repository);
    assert.equal(target?.tourId, "auth-api");
    assert.deepEqual(target?.unsavedTour, midEdit);
  });

  it("reopens from disk when there was nothing unsaved", () => {
    const target = parseTourEditorState(state({ dirty: false }));

    assert.equal(target?.tourId, "auth-api");
    assert.equal(target?.unsavedTour, undefined);
  });

  it("ignores a document that belongs to another tour", () => {
    const target = parseTourEditorState(state({ tour: { ...midEdit, id: "other" } }));

    assert.equal(target?.tourId, "auth-api");
    assert.equal(target?.unsavedTour, undefined);
  });

  it("ignores a document the editor could not render", () => {
    for (const tour of [null, "auth-api", { id: "auth-api" }, { id: "auth-api", title: "t", steps: {} }]) {
      assert.equal(parseTourEditorState(state({ tour }))?.unsavedTour, undefined);
    }
  });

  it("rejects a state that does not identify a tour", () => {
    for (const value of [null, "repository", {}, { scope: "elsewhere", tourId: "auth-api" }, { scope: "repository", tourId: "" }]) {
      assert.equal(parseTourEditorState(value), undefined);
    }
  });
});

describe("isTourDocumentShape", () => {
  it("accepts a document whose collections the form can walk", () => {
    assert.equal(isTourDocumentShape({ id: "a", title: "A", steps: [] }), true);
    assert.equal(isTourDocumentShape(midEdit), true);
  });

  it("rejects anything the form would crash on", () => {
    assert.equal(isTourDocumentShape({ id: "a", title: "A", steps: [{ id: "s", title: "S" }] }), false);
    assert.equal(
      isTourDocumentShape({ id: "a", title: "A", steps: [{ hops: [{ summary: "s" }] }] }),
      false,
    );
    assert.equal(isTourDocumentShape({ id: 1, title: "A", steps: [] }), false);
  });
});
