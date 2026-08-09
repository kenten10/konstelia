import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TourSourceBindingStore } from "../src/application/tours/TourSourceBinding";
import type {
  TourAnchorRegistry,
  TourAnchorRegistryResolver,
} from "../src/application/tours/TourAnchorRegistry";
import { ValidateSavedSource } from "../src/application/tours/ValidateSavedSource";
import { AnchorHealth, type TourAnchor } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { TourScope } from "../src/domain/tour/TourScope";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";
import type { TourStorageProvider } from "../src/infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";

const tour: TourDocument = {
  id: "auth-tour",
  title: "Authentication",
  steps: [{
    id: "login-step",
    title: "Login",
    hops: [{
      summary: "Login",
      anchors: [{ ref: "login", emphasis: "primary" }],
    }],
  }],
};

const anchors: TourAnchor[] = [
  { id: "login", file: "src/auth.ts", symbol: "login" },
  { id: "other", file: "src/other.ts", symbol: "other" },
];

describe("ValidateSavedSource", () => {
  it("revalidates only referenced anchors in the saved file", async () => {
    const service = createService(TourScope.Repository, "/workspace");

    const result = await service.execute({
      scope: TourScope.Repository,
      file: "src/auth.ts",
      sourceText: "export function renamed() { return true; }",
      sourceRoot: "/workspace",
    });

    assert.equal(result.checkedAnchors, 1);
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.scope, TourScope.Repository);
    assert.equal(result.issues[0]?.anchorId, "login");
    assert.equal(result.issues[0]?.health, AnchorHealth.Broken);
    assert.equal(result.issues[0]?.blocksPlayback, true);
    assert.equal(result.issues[0]?.usages[0]?.tourId, "auth-tour");
  });

  it("ignores personal tours bound to another source workspace", async () => {
    const service = createService(TourScope.Personal, "/another-workspace");

    const result = await service.execute({
      scope: TourScope.Personal,
      file: "src/auth.ts",
      sourceText: "export function renamed() { return true; }",
      sourceRoot: "/workspace",
    });

    assert.deepEqual(result, { checkedAnchors: 0, issues: [] });
  });
});

function createService(scope: TourScope, boundRoot: string): ValidateSavedSource {
  const location = { scope, uri: "mem:/tour.tour.yaml" };
  const storage: TourStorageProvider = {
    scope,
    saveTour: () => Promise.reject(new Error("Not used.")),
    updateTour: () => Promise.reject(new Error("Not used.")),
    renameTour: () => Promise.reject(new Error("Not used.")),
    loadTour: () => Promise.resolve(tour),
    listTours: () => Promise.resolve([]),
    scanTours: () => Promise.resolve([{ location, tour, issues: [] }]),
    deleteTour: () => Promise.resolve(),
  };
  const storageResolver: TourStorageResolver = { resolve: () => storage };
  const registry: TourAnchorRegistry = {
    scope,
    loadAnchors: () => Promise.resolve(anchors),
    saveAnchor: () => Promise.resolve(),
    replaceAnchor: () => Promise.resolve(),
  };
  const registryResolver: TourAnchorRegistryResolver = { resolve: () => registry };
  const bindings: TourSourceBindingStore = {
    get: () => Promise.resolve(boundRoot),
    set: () => Promise.resolve(),
  };
  return new ValidateSavedSource(
    storageResolver,
    registryResolver,
    bindings,
    new TypeScriptAnchorAdapter(),
  );
}
