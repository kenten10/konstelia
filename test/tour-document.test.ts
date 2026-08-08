import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeTourDocument, type TourDocument } from "../src/domain/tour/TourDocument";

describe("normalizeTourDocument", () => {
  it("keeps only the fields the schema defines", () => {
    const authored = {
      id: "auth-api",
      title: "Auth API",
      version: 2,
      owner: "platform",
      steps: [{
        id: "login",
        title: "Login",
        note: "internal",
        hops: [{
          summary: "entry",
          anchors: [{ ref: "auth.login", emphasis: "primary", color: "red" }],
        }],
      }],
    } as unknown as TourDocument;

    const normalized = normalizeTourDocument(authored);

    assert.deepEqual(Object.keys(normalized), ["id", "title", "steps"]);
    assert.deepEqual(Object.keys(normalized.steps[0] ?? {}), ["id", "title", "hops"]);
    assert.deepEqual(Object.keys(normalized.steps[0]?.hops[0]?.anchors[0] ?? {}), ["ref", "emphasis"]);
  });

  it("drops blank optional values and trims the rest", () => {
    const normalized = normalizeTourDocument({
      id: " auth-api ",
      title: "  Auth API  ",
      description: "   ",
      prerequisites: ["  overview  ", "   ", "basics"],
      steps: [{
        id: " login ",
        title: " Login ",
        hops: [{ summary: "  entry  ", body: "   ", anchors: [{ ref: " auth.login ", emphasis: "primary" }] }],
        links: [],
      }],
    });

    assert.equal(normalized.id, "auth-api");
    assert.equal(normalized.title, "Auth API");
    assert.equal("description" in normalized, false);
    assert.deepEqual(normalized.prerequisites, ["overview", "basics"]);
    assert.equal(normalized.steps[0]?.hops[0]?.summary, "entry");
    assert.equal("body" in (normalized.steps[0]?.hops[0] ?? {}), false);
    assert.equal(normalized.steps[0]?.hops[0]?.anchors[0]?.ref, "auth.login");
    assert.equal("links" in (normalized.steps[0] ?? {}), false);
  });

  it("keeps markdown bodies intact apart from trailing whitespace", () => {
    const body = "1行目  \n2行目\n\n- 箇条書き\n";
    const normalized = normalizeTourDocument({
      id: "tour",
      title: "Tour",
      steps: [{
        id: "step",
        title: "Step",
        hops: [{ summary: "summary", body, anchors: [{ ref: "a", emphasis: "primary" }] }],
        links: [{ to: " other#step ", label: " Label " }],
      }],
    });

    assert.equal(normalized.steps[0]?.hops[0]?.body, "1行目  \n2行目\n\n- 箇条書き");
    assert.deepEqual(normalized.steps[0]?.links, [{ to: "other#step", label: "Label" }]);
  });
});
