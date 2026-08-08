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

  it("overwrites the file an edited tour already lives in", async () => {
    const fileSystem = new InMemoryFileSystem();
    const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    const created = await provider.saveTour({ id: "a-tour", title: "Alpha", steps: [] });

    const location = await provider.updateTour({
      id: "a-tour",
      title: "Alpha Revised",
      steps: [{
        id: "intro",
        title: "Intro",
        hops: [{ summary: "Start", anchors: [{ ref: "a.b", emphasis: "primary" }] }],
      }],
    });

    assert.equal(location.uri.toString(), created.uri.toString());
    assert.equal((await provider.loadTour("a-tour"))?.title, "Alpha Revised");
    assert.deepEqual([...fileSystem.files.keys()], ["mem:/global/tours/a-tour.tour.yaml"]);
  });

  it("keeps a hand-written file name when its tour id differs", async () => {
    const fileSystem = new InMemoryFileSystem();
    const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    await fileSystem.createDirectory(uri("mem:/global/tours"));
    await fileSystem.writeFile(
      uri("mem:/global/tours/overview.tour.yaml"),
      new TextEncoder().encode("id: auth-api\ntitle: Auth API\nsteps: []\n"),
    );

    const location = await provider.updateTour({ id: "auth-api", title: "Renamed", steps: [] });

    assert.equal(location.uri.toString(), "mem:/global/tours/overview.tour.yaml");
    assert.deepEqual([...fileSystem.files.keys()], ["mem:/global/tours/overview.tour.yaml"]);
    assert.equal((await provider.loadTour("auth-api"))?.title, "Renamed");
  });

  it("leaves no temporary file and keeps the original when the write fails", async () => {
    const fileSystem = new InMemoryFileSystem();
    const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    await provider.saveTour({ id: "a-tour", title: "Alpha", steps: [] });
    const original = fileSystem.files.get("mem:/global/tours/a-tour.tour.yaml");
    fileSystem.renameFile = () => Promise.reject(new Error("Disk is full."));

    await assert.rejects(
      provider.updateTour({ id: "a-tour", title: "Beta", steps: [] }),
      /Disk is full\./,
    );

    assert.deepEqual([...fileSystem.files.keys()], ["mem:/global/tours/a-tour.tour.yaml"]);
    assert.equal(fileSystem.files.get("mem:/global/tours/a-tour.tour.yaml"), original);
  });

  it("serializes concurrent writes so a save cannot interleave with an update", async () => {
    const fileSystem = new InMemoryFileSystem();
    const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    await provider.saveTour({ id: "a-tour", title: "Alpha", steps: [] });
    const order: string[] = [];
    const writeFile = fileSystem.writeFile.bind(fileSystem);
    fileSystem.writeFile = async (target, content) => {
      order.push(`start:${target.toString()}`);
      await Promise.resolve();
      await writeFile(target, content);
      order.push(`end:${target.toString()}`);
    };

    await Promise.all([
      provider.updateTour({ id: "a-tour", title: "First", steps: [] }),
      provider.saveTour({ id: "b-tour", title: "Second", steps: [] }),
    ]);

    for (let index = 0; index < order.length; index += 2) {
      assert.equal(order[index]?.replace("start:", ""), order[index + 1]?.replace("end:", ""));
    }
    assert.equal((await provider.loadTour("a-tour"))?.title, "First");
    assert.equal((await provider.loadTour("b-tour"))?.title, "Second");
  });

  it("refuses to update a tour that was never saved", async () => {
    const provider = new PersonalTourStorageProvider(new InMemoryFileSystem(), uri("mem:/global"));

    await assert.rejects(
      provider.updateTour({ id: "ghost", title: "Ghost", steps: [] }),
      /does not exist in personal storage/,
    );
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
