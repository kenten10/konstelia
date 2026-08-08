import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ListToursWithHealth } from "../src/application/tours/ListToursWithHealth";
import type { TourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import { TourScope } from "../src/domain/tour/TourScope";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";
import type { TourStorageProvider } from "../src/infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";

describe("ListToursWithHealth", () => {
  it("marks a tour broken when its primary symbol cannot be resolved", async () => {
    const location = {
      scope: TourScope.Repository,
      uri: "mem:/repo/.konstelia/tours/auth.tour.yaml",
    };
    const storage = {
      scope: TourScope.Repository,
      saveTour: () => Promise.reject(new Error("Not used.")),
      updateTour: () => Promise.reject(new Error("Not used.")),
      loadTour: () => Promise.resolve(undefined),
      listTours: () => Promise.resolve([]),
      deleteTour: () => Promise.resolve(),
      scanTours: () => Promise.resolve([{
        location,
        issues: [],
        tour: {
          id: "auth",
          title: "Authentication",
          steps: [{
            id: "login",
            title: "Login",
            hops: [{
              summary: "Login",
              anchors: [{ ref: "auth.login", emphasis: "primary" as const }],
            }],
          }],
        },
      }]),
    } as TourStorageProvider;
    const storageResolver: TourStorageResolver = { resolve: () => storage };
    const registryResolver = {
      resolve: () => ({
        scope: TourScope.Repository,
        loadAnchors: () => Promise.resolve([{
          id: "auth.login",
          file: "src/auth.ts",
          symbol: "missing",
        }]),
        saveAnchor: () => Promise.resolve(),
        replaceAnchor: () => Promise.resolve(),
      }),
    } as TourAnchorRegistryResolver;
    const service = new ListToursWithHealth(
      storageResolver,
      registryResolver,
      { readSource: () => Promise.resolve("export function login() {}") },
      new TypeScriptAnchorAdapter(),
    );

    const result = await service.execute(TourScope.Repository);

    assert.equal(result[0]?.health, AnchorHealth.Broken);
    assert.match(result[0]?.reasons[0] ?? "", /auth\.login/);
  });
});
