import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ValidateTourProject } from "../src/application/tours/ValidateTourProject";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import type { TourAnchorReference } from "../src/domain/tour/TourDocument";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";

const source = "export function login() {\n  return true;\n}\n";

function report(anchors: readonly TourAnchorReference[]) {
  return new ValidateTourProject(new TypeScriptAnchorAdapter()).execute({
    root: "repository",
    tours: [{
      file: "auth.tour.yaml",
      issues: [],
      tour: {
        id: "auth",
        title: "Auth",
        steps: [{ id: "login", title: "Login", hops: [{ summary: "login", anchors: [...anchors] }] }],
      },
    }],
    anchors: [{ id: "auth.login", file: "src/auth.ts", symbol: "login" }],
    readSource: () => Promise.resolve(source),
  });
}

describe("ValidateTourProject", () => {
  it("keeps a tour drifted when only a secondary anchor is missing", async () => {
    const result = await report([
      { ref: "auth.login", emphasis: "primary" },
      { ref: "auth.gone", emphasis: "secondary" },
    ]);

    // Specification §7.3: a broken secondary warns the author but must not block readers.
    assert.equal(result.tours[0]?.health, AnchorHealth.Drifted);
    assert.equal(result.health, AnchorHealth.Drifted);
    assert.match(result.tours[0]?.issues[0]?.message ?? "", /auth\.gone/);
  });

  it("breaks a tour when a primary anchor is missing", async () => {
    const result = await report([{ ref: "auth.gone", emphasis: "primary" }]);

    assert.equal(result.tours[0]?.health, AnchorHealth.Broken);
  });

  it("breaks a tour whose document does not satisfy the schema", async () => {
    const result = await new ValidateTourProject(new TypeScriptAnchorAdapter()).execute({
      root: "repository",
      tours: [{ file: "broken.tour.yaml", issues: [{ path: "steps", message: "steps must be an array." }] }],
      anchors: [],
      readSource: () => Promise.resolve(source),
    });

    assert.equal(result.tours[0]?.health, AnchorHealth.Broken);
  });

  it("stays healthy when every reference resolves", async () => {
    const result = await report([{ ref: "auth.login", emphasis: "primary" }]);

    assert.equal(result.tours[0]?.health, AnchorHealth.Healthy);
    assert.deepEqual(result.tours[0]?.issues, []);
  });
});
