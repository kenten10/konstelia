import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PlaySampleTour } from "../src/application/tours/PlaySampleTour";
import type { TourAnchorRegistry } from "../src/application/tours/TourAnchorRegistry";
import type { TourPlayback } from "../src/application/tours/TourPlayback";
import type { TourAnchor } from "../src/domain/tour/TourAnchor";
import { TourScope } from "../src/domain/tour/TourScope";
import { PersonalTourStorageProvider } from "../src/infrastructure/storage/PersonalTourStorageProvider";
import { RepositoryTourAnchorRegistry } from "../src/infrastructure/storage/RepositoryTourAnchorRegistry";
import { RepositoryTourStorageProvider } from "../src/infrastructure/storage/RepositoryTourStorageProvider";
import { SingleRootWorkspaceLocator } from "../src/infrastructure/storage/RepositoryRootLocator";
import { DefaultTourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import { InMemoryFileSystem, uri } from "./fakes";

describe("PlaySampleTour", () => {
  it("loads the sample from repository scope and passes its anchors to playback", async () => {
    const fileSystem = new InMemoryFileSystem();
    const repositoryStorage = new RepositoryTourStorageProvider(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    await repositoryStorage.saveTour({ id: "sample-tour", title: "Sample", steps: [] });
    const personalStorage = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    const anchors: TourAnchor[] = [{ id: "sample.entry", file: "sample.ts", symbol: "entry" }];
    const registry: TourAnchorRegistry = {
      scope: TourScope.Repository,
      loadAnchors: () => Promise.resolve(anchors),
      saveAnchor: () => Promise.resolve(),
      replaceAnchor: () => Promise.resolve(),
    };
    let playedTourId: string | undefined;
    let playedAnchors: readonly TourAnchor[] | undefined;
    const playback: TourPlayback = {
      start: (tour, loadedAnchors) => {
        playedTourId = tour.id;
        playedAnchors = loadedAnchors;
        return Promise.resolve();
      },
    };
    const resolver = new DefaultTourStorageResolver([personalStorage, repositoryStorage]);

    await new PlaySampleTour(resolver, registry, playback).execute();

    assert.equal(playedTourId, "sample-tour");
    assert.equal(playedAnchors, anchors);
  });
});

describe("RepositoryTourAnchorRegistry", () => {
  it("loads anchors from the isolated repository location", async () => {
    const fileSystem = new InMemoryFileSystem();
    const root = uri("mem:/repo");
    await fileSystem.writeFile(
      uri("mem:/repo/.konstelia/anchors.yaml"),
      new TextEncoder().encode("anchors:\n  - id: sample.entry\n    file: sample.ts\n    symbol: App.entry\n"),
    );
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [root]),
    );

    const anchors = await registry.loadAnchors();

    assert.deepEqual(anchors, [{ id: "sample.entry", file: "sample.ts", symbol: "App.entry" }]);
  });
});
