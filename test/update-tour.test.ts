import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import { UpdateTour } from "../src/application/tours/UpdateTour";
import type { TourAnchor } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { TourScope } from "../src/domain/tour/TourScope";
import type {
  StoredTourFile,
  TourStorageProvider,
} from "../src/infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";

function storedTour(tour: TourDocument): StoredTourFile {
  return {
    location: {
      scope: TourScope.Repository,
      uri: `mem:/repo/.konstelia/tours/${tour.id}.tour.yaml`,
    },
    tour,
    issues: [],
  };
}

function fixture(overrides: Partial<TourDocument> = {}): TourDocument {
  return {
    id: "auth-api",
    title: "認証APIの流れ",
    steps: [{
      id: "login",
      title: "ログイン",
      hops: [{
        summary: "エントリポイント",
        anchors: [{ ref: "auth.login", emphasis: "primary" }],
      }],
    }],
    ...overrides,
  };
}

function createUpdateTour(options: {
  files?: readonly StoredTourFile[];
  anchors?: readonly TourAnchor[];
  updates?: TourDocument[];
} = {}): UpdateTour {
  const files = options.files ?? [storedTour(fixture())];
  const storage = {
    scope: TourScope.Repository,
    saveTour: () => Promise.reject(new Error("Not used.")),
    renameTour: () => Promise.reject(new Error("Not used.")),
    updateTour: (tour: TourDocument) => {
      options.updates?.push(tour);
      const match = files.find((file) => file.tour?.id === tour.id);
      if (!match) {
        return Promise.reject(new Error(`Tour '${tour.id}' does not exist.`));
      }
      return Promise.resolve(match.location);
    },
    loadTour: () => Promise.resolve(undefined),
    listTours: () => Promise.resolve([]),
    scanTours: () => Promise.resolve([...files]),
    deleteTour: () => Promise.resolve(),
  } as TourStorageProvider;
  const storageResolver: TourStorageResolver = { resolve: () => storage };
  const registryResolver = {
    resolve: () => ({
      scope: TourScope.Repository,
      loadAnchors: () => Promise.resolve([...(options.anchors ?? [{ id: "auth.login", file: "src/auth.ts", symbol: "login" }])]),
      saveAnchor: () => Promise.resolve(),
      replaceAnchor: () => Promise.resolve(),
    }),
  } as TourAnchorRegistryResolver;
  return new UpdateTour(storageResolver, registryResolver);
}

describe("UpdateTour", () => {
  it("writes the edited tour back to its own file", async () => {
    const updates: TourDocument[] = [];
    const updateTour = createUpdateTour({ updates });

    const result = await updateTour.execute({
      scope: TourScope.Repository,
      tour: fixture({ title: "認証APIの流れ（改訂）" }),
    });

    assert.deepEqual(result.issues, []);
    assert.equal(result.location?.uri.toString(), "mem:/repo/.konstelia/tours/auth-api.tour.yaml");
    assert.equal(updates[0]?.title, "認証APIの流れ（改訂）");
  });

  it("drops blank optional fields before saving", async () => {
    const updates: TourDocument[] = [];
    const updateTour = createUpdateTour({ updates });

    await updateTour.execute({
      scope: TourScope.Repository,
      tour: fixture({
        description: "   ",
        prerequisites: [],
        steps: [{
          id: "login",
          title: "ログイン",
          hops: [{
            summary: "  エントリポイント  ",
            body: "",
            anchors: [{ ref: "auth.login", emphasis: "primary" }],
          }],
          links: [],
        }],
      }),
    });

    const saved = updates[0];
    assert.ok(saved);
    assert.equal("description" in saved, false);
    assert.equal("prerequisites" in saved, false);
    assert.equal("links" in (saved.steps[0] ?? {}), false);
    assert.equal("body" in (saved.steps[0]?.hops[0] ?? {}), false);
    assert.equal(saved.steps[0]?.hops[0]?.summary, "エントリポイント");
  });

  it("refuses a hop without exactly one primary anchor", async () => {
    const updates: TourDocument[] = [];
    const updateTour = createUpdateTour({ updates });

    const result = await updateTour.execute({
      scope: TourScope.Repository,
      tour: fixture({
        steps: [{
          id: "login",
          title: "ログイン",
          hops: [{
            summary: "エントリポイント",
            anchors: [
              { ref: "auth.login", emphasis: "primary" },
              { ref: "auth.login", emphasis: "primary" },
            ],
          }],
        }],
      }),
    });

    assert.deepEqual(updates, []);
    assert.match(result.issues[0]?.message ?? "", /exactly one primary/);
    assert.equal(result.issues[0]?.path, "steps[0].hops[0].anchors");
  });

  it("refuses a reference that the anchor registry does not define", async () => {
    const updates: TourDocument[] = [];
    const updateTour = createUpdateTour({ updates, anchors: [] });

    const result = await updateTour.execute({
      scope: TourScope.Repository,
      tour: fixture(),
    });

    assert.deepEqual(updates, []);
    assert.deepEqual(result.issues, [{
      path: "steps[0].hops[0].anchors[0].ref",
      message: "Anchor 'auth.login' does not exist in the registry.",
    }]);
  });

  it("refuses a cross link whose target step is missing", async () => {
    const updateTour = createUpdateTour();

    const result = await updateTour.execute({
      scope: TourScope.Repository,
      tour: fixture({
        steps: [{
          id: "login",
          title: "ログイン",
          hops: [{
            summary: "エントリポイント",
            anchors: [{ ref: "auth.login", emphasis: "primary" }],
          }],
          links: [{ to: "auth-internals#token", label: "深掘り" }],
        }],
      }),
    });

    assert.equal(result.issues[0]?.path, "steps[0].links[0].to");
  });

  it("reports catalog issues only for the edited tour", async () => {
    const other = storedTour({
      id: "other",
      title: "Other",
      prerequisites: ["missing-tour"],
      steps: [],
    });
    const updateTour = createUpdateTour({ files: [storedTour(fixture()), other] });

    const result = await updateTour.execute({
      scope: TourScope.Repository,
      tour: fixture({ prerequisites: ["other"] }),
    });

    assert.deepEqual(result.issues, []);
  });

  it("validates without writing anything", async () => {
    const updates: TourDocument[] = [];
    const updateTour = createUpdateTour({ updates });

    const issues = await updateTour.validate({
      scope: TourScope.Repository,
      tour: fixture({ title: "  " }),
    });

    assert.deepEqual(updates, []);
    assert.equal(issues[0]?.path, "title");
  });

  it("fails when the tour is no longer in storage", async () => {
    const updateTour = createUpdateTour({ files: [] });

    await assert.rejects(
      () => updateTour.execute({ scope: TourScope.Repository, tour: fixture() }),
      /was not found in repository storage/,
    );
  });
});
