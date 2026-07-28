import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSafeTourSourcePath } from "../src/domain/tour/TourSourcePath";
import { deserializeAnchors } from "../src/infrastructure/storage/AnchorYaml";

describe("tour source paths", () => {
  it("accepts only normalized workspace-relative files", () => {
    assert.doesNotThrow(() => assertSafeTourSourcePath("src/orders/service.ts"));
    for (const file of ["../secret.ts", "src/../secret.ts", "/tmp/secret.ts", "C:\\secret.ts", "src//file.ts", "./file.ts"]) {
      assert.throws(() => assertSafeTourSourcePath(file), /inside the workspace root/);
    }
  });

  it("rejects unsafe paths while loading an anchor registry", () => {
    const yaml = new TextEncoder().encode("anchors:\n  - id: escape\n    file: ../secret.ts\n    symbol: secret\n");
    assert.throws(() => deserializeAnchors(yaml), /registry is not valid/);
  });
});
