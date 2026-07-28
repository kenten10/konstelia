import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TourScope } from "../src/domain/tour/TourScope";
import { PersonalTourStorageProvider } from "../src/infrastructure/storage/PersonalTourStorageProvider";
import { RepositoryTourStorageProvider } from "../src/infrastructure/storage/RepositoryTourStorageProvider";
import {
  FixedRepositoryRootLocator,
  SingleRootWorkspaceLocator,
} from "../src/infrastructure/storage/RepositoryRootLocator";
import { DefaultTourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import { WorkspaceTourStorageProvider } from "../src/infrastructure/storage/WorkspaceTourStorageProvider";
import { InMemoryFileSystem, uri } from "./fakes";

describe("tour storage scopes", () => {
  it("supports a fixed repository root for bundled sample assets", () => {
    const root = uri("mem:/extension");
    assert.equal(new FixedRepositoryRootLocator(root).getRoot(), root);
  });

  it("resolves each TourScope to its provider", () => {
    const fileSystem = new InMemoryFileSystem();
    const personal = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    const workspace = new WorkspaceTourStorageProvider(fileSystem, uri("mem:/workspace-state"));
    const repository = new RepositoryTourStorageProvider(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    const resolver = new DefaultTourStorageResolver([personal, workspace, repository]);

    assert.equal(resolver.resolve(TourScope.Personal), personal);
    assert.equal(resolver.resolve(TourScope.Workspace), workspace);
    assert.equal(resolver.resolve(TourScope.Repository), repository);
  });

  it("selects the correct base URI and creates missing directories", async () => {
    const fileSystem = new InMemoryFileSystem();
    const providers = [
      new PersonalTourStorageProvider(fileSystem, uri("mem:/global")),
      new WorkspaceTourStorageProvider(fileSystem, uri("mem:/workspace-state")),
      new RepositoryTourStorageProvider(
        fileSystem,
        new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
      ),
    ];

    const locations = await Promise.all(
      providers.map((provider) => provider.saveTour({ id: provider.scope, title: provider.scope, steps: [] })),
    );

    assert.equal(locations[0]?.uri.toString(), "mem:/global/tours/personal.tour.yaml");
    assert.equal(locations[1]?.uri.toString(), "mem:/workspace-state/tours/workspace.tour.yaml");
    assert.equal(locations[2]?.uri.toString(), "mem:/repo/.konstelia/tours/repository.tour.yaml");
    assert.deepEqual(
      [...fileSystem.directories].sort(),
      ["mem:/global/tours", "mem:/repo/.konstelia/tours", "mem:/workspace-state/tours"],
    );
  });

  it("saves and lists tours", async () => {
    const fileSystem = new InMemoryFileSystem();
    const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    await provider.saveTour({ id: "z-tour", title: "Zulu", steps: [] });
    await provider.saveTour({ id: "a-tour", title: "Alpha", steps: [] });

    const tours = await provider.listTours();

    assert.deepEqual(tours.map(({ id }) => id), ["a-tour", "z-tour"]);
    assert.equal((await provider.loadTour("z-tour"))?.title, "Zulu");
  });

  it("handles unavailable workspace storage", async () => {
    const provider = new WorkspaceTourStorageProvider(new InMemoryFileSystem(), undefined);

    await assert.rejects(
      provider.saveTour({ id: "missing", title: "Missing", steps: [] }),
      /Workspace tour storage is unavailable/,
    );
  });

  it("reports invalid tour files while excluding them from normal listings", async () => {
    const fileSystem = new InMemoryFileSystem();
    const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    await fileSystem.createDirectory(uri("mem:/global/tours"));
    await fileSystem.writeFile(
      uri("mem:/global/tours/invalid.tour.yaml"),
      new TextEncoder().encode("id: invalid\nsteps: not-an-array\n"),
    );

    const scanned = await provider.scanTours();

    assert.equal(scanned.length, 1);
    assert.equal(scanned[0]?.tour, undefined);
    assert.ok((scanned[0]?.issues.length ?? 0) > 0);
    assert.deepEqual(await provider.listTours(), []);
  });
});
