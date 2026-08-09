import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  InstallSampleTours,
  type ScopedTourSample,
} from "../src/application/tours/InstallSampleTours";
import { PlayTour } from "../src/application/tours/PlayTour";
import { DefaultTourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import type { TourPlayback } from "../src/application/tours/TourPlayback";
import { TourScope } from "../src/domain/tour/TourScope";
import { PersonalTourAnchorRegistry } from "../src/infrastructure/storage/PersonalTourAnchorRegistry";
import { PersonalTourStorageProvider } from "../src/infrastructure/storage/PersonalTourStorageProvider";
import { RepositoryTourAnchorRegistry } from "../src/infrastructure/storage/RepositoryTourAnchorRegistry";
import { RepositoryTourStorageProvider } from "../src/infrastructure/storage/RepositoryTourStorageProvider";
import { SingleRootWorkspaceLocator } from "../src/infrastructure/storage/RepositoryRootLocator";
import { DefaultTourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import { WorkspaceTourAnchorRegistry } from "../src/infrastructure/storage/WorkspaceTourAnchorRegistry";
import { WorkspaceTourStorageProvider } from "../src/infrastructure/storage/WorkspaceTourStorageProvider";
import { InMemoryFileSystem, uri } from "./fakes";

describe("InstallSampleTours", () => {
  it("installs idempotent samples that PlayTour can load from every scope", async () => {
    const fileSystem = new InMemoryFileSystem();
    const repositoryRoot = new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]);
    const storageResolver = new DefaultTourStorageResolver([
      new PersonalTourStorageProvider(fileSystem, uri("mem:/global")),
      new WorkspaceTourStorageProvider(fileSystem, uri("mem:/workspace-storage")),
      new RepositoryTourStorageProvider(fileSystem, repositoryRoot),
    ]);
    const anchorResolver = new DefaultTourAnchorRegistryResolver([
      new PersonalTourAnchorRegistry(fileSystem, uri("mem:/global")),
      new WorkspaceTourAnchorRegistry(fileSystem, uri("mem:/workspace-storage")),
      new RepositoryTourAnchorRegistry(fileSystem, repositoryRoot),
    ]);
    const samples = Object.values(TourScope).map((scope): ScopedTourSample => ({
      scope,
      tour: {
        id: `${scope}-sample`,
        title: `${scope} sample`,
        steps: [{
          id: "entry",
          title: "Entry",
          hops: [{
            summary: "Sample hop",
            anchors: [{ ref: "sample.entry", emphasis: "primary" }],
          }],
        }],
      },
      anchors: [{ id: "sample.entry", file: "sample.ts", symbol: "entry" }],
    }));
    const installer = new InstallSampleTours(
      { loadSamples: () => Promise.resolve(samples) },
      storageResolver,
      anchorResolver,
    );

    const first = await installer.execute();
    const second = await installer.execute();

    assert.equal(first.every((result) => result.installed), true);
    assert.equal(second.every((result) => !result.installed), true);
    const played: string[] = [];
    const playback: TourPlayback = {
      start: ({ tour, anchors }) => {
        played.push(`${tour.id}:${anchors.map((anchor) => anchor.id).join(",")}`);
        return Promise.resolve();
      },
    };
    const playTour = new PlayTour(storageResolver, anchorResolver, playback);
    for (const scope of Object.values(TourScope)) {
      await playTour.execute(scope, `${scope}-sample`);
    }
    assert.deepEqual(played, [
      "personal-sample:sample.entry",
      "workspace-sample:sample.entry",
      "repository-sample:sample.entry",
    ]);
  });
});
