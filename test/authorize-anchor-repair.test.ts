import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuthorizeAnchorRepair } from "../src/application/anchors/AuthorizeAnchorRepair";
import type { TourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import type { TourSourceBindingStore } from "../src/application/tours/TourSourceBinding";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { TourScope } from "../src/domain/tour/TourScope";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";

describe("AuthorizeAnchorRepair", () => {
  it("allows a personal anchor only in the workspace shared by all referencing tours", async () => {
    const authorizer = createAuthorizer(
      [tour("first"), tour("second")],
      new Map([
        ["first", "mem:/repo-a"],
        ["second", "mem:/repo-a"],
      ]),
    );

    await authorizer.assertAllowed(TourScope.Personal, "shared.anchor", "mem:/repo-a");
    await assert.rejects(
      authorizer.assertAllowed(TourScope.Personal, "shared.anchor", "mem:/repo-b"),
      /belongs to source workspace 'mem:\/repo-a'/,
    );
  });

  it("rejects unbound and cross-workspace personal tour references", async () => {
    const unbound = createAuthorizer(
      [tour("first"), tour("second")],
      new Map([["first", "mem:/repo-a"]]),
    );
    await assert.rejects(
      unbound.assertAllowed(TourScope.Personal, "shared.anchor", "mem:/repo-a"),
      /unbound tour\(s\): second/,
    );

    const mixed = createAuthorizer(
      [tour("first"), tour("second")],
      new Map([
        ["first", "mem:/repo-a"],
        ["second", "mem:/repo-b"],
      ]),
    );
    await assert.rejects(
      mixed.assertAllowed(TourScope.Personal, "shared.anchor", "mem:/repo-a"),
      /different source workspaces/,
    );
  });

  it("does not apply personal binding rules to repository anchors", async () => {
    const authorizer = createAuthorizer([tour("first")], new Map());

    await authorizer.assertAllowed(TourScope.Repository, "shared.anchor");
  });
});

function createAuthorizer(
  tours: readonly TourDocument[],
  bindings: ReadonlyMap<string, string>,
): AuthorizeAnchorRepair {
  const storageResolver = {
    resolve: (scope: TourScope) => ({
      scope,
      scanTours: () => Promise.resolve(tours.map((storedTour, index) => ({
        location: { scope, uri: `mem:/tour-${index}.tour.yaml` },
        tour: storedTour,
        issues: [],
      }))),
    }),
  } as unknown as TourStorageResolver;
  const registryResolver = {
    resolve: (scope: TourScope) => ({
      scope,
      loadAnchors: () => Promise.resolve([{
        id: "shared.anchor",
        file: "src/auth.ts",
        symbol: "login",
      }]),
    }),
  } as TourAnchorRegistryResolver;
  const sourceBindings: TourSourceBindingStore = {
    get: (_scope, tourId) => Promise.resolve(bindings.get(tourId)),
    set: () => Promise.resolve(),
  };
  return new AuthorizeAnchorRepair(storageResolver, registryResolver, sourceBindings);
}

function tour(id: string): TourDocument {
  return {
    id,
    title: id,
    steps: [{
      id: "step",
      title: "Step",
      hops: [{
        summary: "Hop",
        anchors: [{ ref: "shared.anchor", emphasis: "primary" }],
      }],
    }],
  };
}
