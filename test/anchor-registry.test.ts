import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DefaultTourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import type { TourAnchor } from "../src/domain/tour/TourAnchor";
import { TourScope } from "../src/domain/tour/TourScope";
import { PersonalTourAnchorRegistry } from "../src/infrastructure/storage/PersonalTourAnchorRegistry";
import { RepositoryTourAnchorRegistry } from "../src/infrastructure/storage/RepositoryTourAnchorRegistry";
import { SingleRootWorkspaceLocator } from "../src/infrastructure/storage/RepositoryRootLocator";
import { WorkspaceTourAnchorRegistry } from "../src/infrastructure/storage/WorkspaceTourAnchorRegistry";
import { InMemoryFileSystem, uri } from "./fakes";
import type { Uri } from "vscode";

class RenameFailingFileSystem extends InMemoryFileSystem {
  public failRename = false;

  public override renameFile(source: Uri, target: Uri, overwrite: boolean): Promise<void> {
    return this.failRename
      ? Promise.reject(new Error("rename failed"))
      : super.renameFile(source, target, overwrite);
  }
}

const anchor: TourAnchor = {
  id: "app.entry",
  file: "src/app.ts",
  symbol: "App.entry",
  refinement: "call(run)[0]",
  snapshot: { hash: "sha256:test", text: "run()" },
};

describe("tour anchor registries", () => {
  it("resolves and saves each logical scope at its own base URI", async () => {
    const fileSystem = new InMemoryFileSystem();
    const personal = new PersonalTourAnchorRegistry(fileSystem, uri("mem:/global"));
    const workspace = new WorkspaceTourAnchorRegistry(fileSystem, uri("mem:/workspace-state"));
    const repository = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    const resolver = new DefaultTourAnchorRegistryResolver([personal, workspace, repository]);

    for (const scope of [TourScope.Personal, TourScope.Workspace, TourScope.Repository]) {
      await resolver.resolve(scope).saveAnchor({ ...anchor, id: `${scope}.entry` });
    }

    assert.ok(fileSystem.files.has("mem:/global/anchors.yaml"));
    assert.ok(fileSystem.files.has("mem:/workspace-state/anchors.yaml"));
    assert.ok(fileSystem.files.has("mem:/repo/.konstelia/anchors.yaml"));
  });

  it("rejects duplicate anchor IDs", async () => {
    const registry = new PersonalTourAnchorRegistry(new InMemoryFileSystem(), uri("mem:/global"));
    await registry.saveAnchor(anchor);

    await assert.rejects(registry.saveAnchor(anchor), /already exists/);
  });

  it("rejects replacement of an unknown anchor ID", async () => {
    const registry = new PersonalTourAnchorRegistry(new InMemoryFileSystem(), uri("mem:/global"));

    await assert.rejects(registry.replaceAnchor(anchor), /does not exist/);
  });

  it("handles unavailable workspace anchor storage", async () => {
    const registry = new WorkspaceTourAnchorRegistry(new InMemoryFileSystem(), undefined);

    await assert.rejects(registry.loadAnchors(), /Workspace anchor storage is unavailable/);
  });

  it("serializes concurrent writes without losing anchors", async () => {
    const registry = new PersonalTourAnchorRegistry(new InMemoryFileSystem(), uri("mem:/global"));
    await Promise.all([
      registry.saveAnchor({ id: "one", file: "one.ts", symbol: "one" }),
      registry.saveAnchor({ id: "two", file: "two.ts", symbol: "two" }),
    ]);
    assert.deepEqual((await registry.loadAnchors()).map((anchor) => anchor.id), ["one", "two"]);
  });

  it("preserves the previous registry when atomic replacement fails", async () => {
    const fileSystem = new RenameFailingFileSystem();
    const registry = new PersonalTourAnchorRegistry(fileSystem, uri("mem:/global"));
    await registry.saveAnchor(anchor);
    fileSystem.failRename = true;

    await assert.rejects(registry.replaceAnchor({ ...anchor, symbol: "App.changed" }), /rename failed/);

    assert.equal((await registry.loadAnchors())[0]?.symbol, "App.entry");
    assert.equal([...fileSystem.files.keys()].some((file) => file.endsWith(".tmp")), false);
  });
});
