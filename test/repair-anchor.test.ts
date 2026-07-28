import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RepairAnchor } from "../src/application/anchors/RepairAnchor";
import { DefaultTourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import { AnchorHealth } from "../src/domain/tour/TourAnchor";
import { TourScope } from "../src/domain/tour/TourScope";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";
import { RepositoryTourAnchorRegistry } from "../src/infrastructure/storage/RepositoryTourAnchorRegistry";
import { SingleRootWorkspaceLocator } from "../src/infrastructure/storage/RepositoryRootLocator";
import { InMemoryFileSystem, uri } from "./fakes";
import type { AnchorSourceCatalog } from "../src/application/anchors/AnchorSourceCatalog";
import type { AnchorRepairAuthorizer } from "../src/application/anchors/AuthorizeAnchorRepair";
import {
  RepairAnchorCommand,
  type RepairAnchorUserInterface,
} from "../src/presentation/commands/RepairAnchorCommand";
import type { Logger } from "../src/shared/logging/Logger";

describe("RepairAnchor", () => {
  it("rebinds an existing ID to a generated semantic target and snapshot", async () => {
    const fileSystem = new InMemoryFileSystem();
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    await registry.saveAnchor({
      id: "auth.login",
      file: "src/auth.ts",
      symbol: "missing",
      snapshot: { hash: "sha256:old", text: "old code" },
    });
    const sourceText = "export function login() { return true; }";
    const service = new RepairAnchor(
      new TypeScriptAnchorAdapter(),
      new DefaultTourAnchorRegistryResolver([registry]),
      sourceCatalog({ "src/auth.ts": sourceText }),
    );

    const preparation = await service.prepare(TourScope.Repository, {
      file: "src/auth.ts",
      sourceText,
      selectionStart: 0,
      selectionEnd: sourceText.length,
    });

    assert.equal(preparation.candidates[0]?.health, AnchorHealth.Broken);
    const repaired = await service.rebind(
      TourScope.Repository,
      "auth.login",
      preparation.proposal,
    );
    assert.equal(repaired.id, "auth.login");
    assert.equal(repaired.symbol, "login");
    assert.match(repaired.snapshot?.hash ?? "", /^sha256:/);
    const [loaded] = await registry.loadAnchors();
    assert.equal(loaded?.id, repaired.id);
    assert.equal(loaded?.file, repaired.file);
    assert.equal(loaded?.symbol, repaired.symbol);
    assert.deepEqual(loaded?.snapshot, repaired.snapshot);
  });

  it("updates the file when a symbol moves", async () => {
    const fileSystem = new InMemoryFileSystem();
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    await registry.saveAnchor({ id: "auth.login", file: "src/auth.ts", symbol: "login" });
    const sourceText = "export function login() {}";
    const service = new RepairAnchor(
      new TypeScriptAnchorAdapter(),
      new DefaultTourAnchorRegistryResolver([registry]),
      sourceCatalog({ "src/other.ts": sourceText }),
    );
    const preparation = await service.prepare(TourScope.Repository, {
      file: "src/other.ts",
      sourceText,
      selectionStart: 0,
      selectionEnd: sourceText.length,
    });

    assert.equal(preparation.candidates[0]?.anchor.id, "auth.login");
    assert.equal(preparation.candidates[0]?.health, undefined);
    const repaired = await service.rebind(
      TourScope.Repository,
      "auth.login",
      preparation.proposal,
    );

    assert.equal(repaired.file, "src/other.ts");
    assert.equal((await registry.loadAnchors())[0]?.file, "src/other.ts");
  });

  it("rejects a proposal when its source changes during confirmation", async () => {
    const fileSystem = new InMemoryFileSystem();
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    await registry.saveAnchor({ id: "auth.login", file: "src/auth.ts", symbol: "missing" });
    const files = { "src/auth.ts": "export function login() { return true; }" };
    const service = new RepairAnchor(
      new TypeScriptAnchorAdapter(),
      new DefaultTourAnchorRegistryResolver([registry]),
      sourceCatalog(files),
    );
    const preparation = await service.prepare(TourScope.Repository, {
      file: "src/auth.ts",
      sourceText: files["src/auth.ts"],
      selectionStart: 0,
      selectionEnd: files["src/auth.ts"].length,
    });
    files["src/auth.ts"] = "export function login() { return false; }";

    await assert.rejects(
      service.rebind(TourScope.Repository, "auth.login", preparation.proposal),
      /changed while it was being reviewed/,
    );
    assert.equal((await registry.loadAnchors())[0]?.symbol, "missing");
  });

  it("authorizes selection repair before asking for rebind confirmation", async () => {
    const fileSystem = new InMemoryFileSystem();
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    await registry.saveAnchor({ id: "auth.login", file: "src/auth.ts", symbol: "missing" });
    const sourceText = "export function login() {}";
    const service = new RepairAnchor(
      new TypeScriptAnchorAdapter(),
      new DefaultTourAnchorRegistryResolver([registry]),
      sourceCatalog({ "src/auth.ts": sourceText }),
    );
    const events: string[] = [];
    const authorizer: AnchorRepairAuthorizer = {
      assertAllowed: (_scope, anchorId, root) => {
        events.push(`authorize:${anchorId}:${root ?? ""}`);
        return Promise.resolve();
      },
    };
    const userInterface: RepairAnchorUserInterface = {
      captureSelection: () => Promise.resolve({
        file: "src/auth.ts",
        sourceText,
        selectionStart: 0,
        selectionEnd: sourceText.length,
      }),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/repo", name: "repo" }),
      chooseScope: () => Promise.resolve(TourScope.Repository),
      chooseAnchor: (candidates) => Promise.resolve(candidates[0]),
      confirmRebind: () => {
        events.push("confirm");
        return Promise.resolve(false);
      },
      showInformation: () => Promise.resolve(),
      showSuccess: () => Promise.resolve(),
      showError: () => Promise.resolve(),
    };
    const logger: Logger = { info: () => undefined, error: () => undefined };

    await new RepairAnchorCommand(service, authorizer, userInterface, logger).execute();

    assert.deepEqual(events, ["authorize:auth.login:mem:/repo", "confirm"]);
  });
});

function sourceCatalog(files: Record<string, string>): AnchorSourceCatalog {
  return {
    scanSources: () => Promise.resolve({ sources: [], skippedFiles: 0, cancelled: false }),
    readSource: (file) => Promise.resolve(files[file]),
  };
}
