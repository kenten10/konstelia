import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  TourAnchorRegistry,
  TourAnchorRegistryResolver,
} from "../src/application/tours/TourAnchorRegistry";
import { ValidateTourCatalog } from "../src/application/tours/ValidateTourCatalog";
import { TourScope } from "../src/domain/tour/TourScope";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import type { TourStorageProvider } from "../src/infrastructure/storage/TourStorageProvider";
import { uri } from "./fakes";

describe("ValidateTourCatalog", () => {
  it("reports missing anchor references from the selected scope", async () => {
    const location = { scope: TourScope.Workspace, uri: uri("mem:/tour.tour.yaml") };
    const storageProvider: TourStorageProvider = {
      scope: TourScope.Workspace,
      saveTour: () => Promise.reject(new Error("Not used.")),
      updateTour: () => Promise.reject(new Error("Not used.")),
      loadTour: () => Promise.resolve(undefined),
      listTours: () => Promise.resolve([]),
      deleteTour: () => Promise.resolve(),
      scanTours: () => Promise.resolve([{
        location,
        issues: [],
        tour: {
          id: "tour",
          title: "Tour",
          steps: [{
            id: "step",
            title: "Step",
            hops: [{
              summary: "Hop",
              anchors: [{ ref: "missing", emphasis: "primary" as const }],
            }],
          }],
        },
      }]),
    };
    const storageResolver: TourStorageResolver = {
      resolve: (scope: TourScope) => {
        assert.equal(scope, TourScope.Workspace);
        return storageProvider;
      },
    };
    const anchorRegistry: TourAnchorRegistry = {
      scope: TourScope.Workspace,
      loadAnchors: () => Promise.resolve([]),
      saveAnchor: () => Promise.resolve(),
      replaceAnchor: () => Promise.resolve(),
    };
    const anchorRegistryResolver: TourAnchorRegistryResolver = {
      resolve: (scope: TourScope) => {
        assert.equal(scope, TourScope.Workspace);
        return anchorRegistry;
      },
    };

    const result = await new ValidateTourCatalog(
      storageResolver,
      anchorRegistryResolver,
    ).execute(TourScope.Workspace);

    assert.deepEqual(result[0]?.issues, [{
      path: "steps[0].hops[0].anchors[0].ref",
      message: "Anchor 'missing' does not exist in workspace storage.",
    }]);
  });
});
