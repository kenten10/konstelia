import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAnchorSnapshot } from "../src/application/anchors/AnchorSnapshot";
import type { AnchorSourceCatalog } from "../src/application/anchors/AnchorSourceCatalog";
import { DiscoverAnchorRepairs } from "../src/application/anchors/DiscoverAnchorRepairs";
import { RepairAnchor } from "../src/application/anchors/RepairAnchor";
import type { AnchorRepairAuthorizer } from "../src/application/anchors/AuthorizeAnchorRepair";
import { DefaultTourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import { TourScope } from "../src/domain/tour/TourScope";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";
import { RepositoryTourAnchorRegistry } from "../src/infrastructure/storage/RepositoryTourAnchorRegistry";
import { SingleRootWorkspaceLocator } from "../src/infrastructure/storage/RepositoryRootLocator";
import {
  DiscoverAnchorRepairsCommand,
  type DiscoverAnchorRepairsUserInterface,
} from "../src/presentation/commands/DiscoverAnchorRepairsCommand";
import type { Logger } from "../src/shared/logging/Logger";
import { InMemoryFileSystem, uri } from "./fakes";

describe("DiscoverAnchorRepairs", () => {
  it("discovers and ranks candidates across workspace source files", async () => {
    const { discover } = await createServices({
      scanSources: () => Promise.resolve({
        sources: [
          { file: "src/noise.ts", sourceText: "export function unrelated() { return false; }" },
          { file: "src/moved.ts", sourceText: originalSource },
        ],
        skippedFiles: 0,
        cancelled: false,
      }),
      readSource: (file) => Promise.resolve(file === "src/moved.ts" ? originalSource : undefined),
    });

    const discovery = await discover.execute(TourScope.Repository, "auth.login");

    assert.equal(discovery.targets[0]?.proposal.file, "src/moved.ts");
    assert.equal(discovery.targets[0]?.proposal.symbol, "login");
    assert.equal(discovery.targets[0]?.similarity, 1);
    assert.ok(discovery.targets.every((target) => target.similarity >= 0.3));
  });

  it("coordinates an explicit rebind without direct filesystem access", async () => {
    const { discover, repair, registry } = await createServices({
      scanSources: () => Promise.resolve({
        sources: [{ file: "src/moved.ts", sourceText: originalSource }],
        skippedFiles: 1,
        cancelled: true,
      }),
      readSource: () => Promise.resolve(originalSource),
    });
    const events: string[] = [];
    const userInterface: DiscoverAnchorRepairsUserInterface = {
      chooseScope: () => Promise.resolve(TourScope.Repository),
      getCurrentSourceWorkspace: () => ({ uri: "mem:/repo", name: "repo" }),
      chooseStoredAnchor: (anchors) => {
        events.push(`anchor:${anchors[0]?.id ?? ""}`);
        return Promise.resolve(anchors[0]);
      },
      chooseRepairTarget: (targets) => {
        events.push(`target:${targets[0]?.proposal.file ?? ""}`);
        return Promise.resolve(targets[0]);
      },
      confirmDiscoveredRebind: () => {
        events.push("confirm");
        return Promise.resolve(true);
      },
      showInformation: (message) => {
        events.push(`info:${message}`);
        return Promise.resolve();
      },
      showSuccess: () => {
        events.push("success");
        return Promise.resolve();
      },
      showError: () => Promise.resolve(),
    };
    const logger: Logger = {
      info: () => events.push("log"),
      error: () => undefined,
    };
    const authorizer: AnchorRepairAuthorizer = {
      assertAllowed: () => {
        events.push("authorize");
        return Promise.resolve();
      },
    };

    await new DiscoverAnchorRepairsCommand(
      discover,
      repair,
      authorizer,
      userInterface,
      logger,
    ).execute();

    assert.deepEqual(events, [
      "anchor:auth.login",
      "authorize",
      "info:The search was cancelled and results are partial. 1 source file(s) could not be read.",
      "target:src/moved.ts",
      "confirm",
      "authorize",
      "success",
      "log",
    ]);
    assert.equal((await registry.loadAnchors())[0]?.file, "src/moved.ts");
  });

  it("keeps a matching symbol after more than twelve identical snippets", async () => {
    const functions = [
      ...Array.from({ length: 12 }, (_, index) => `function noise${index}() { return false; }`),
      "function target() { return false; }",
    ].join("\n");
    const snapshot = "return false;";
    const fileSystem = new InMemoryFileSystem();
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    await registry.saveAnchor({
      id: "target.return",
      file: "src/old.ts",
      symbol: "target",
      refinement: "return[0]",
      snapshot: createAnchorSnapshot(snapshot),
    });
    const catalog: AnchorSourceCatalog = {
      scanSources: () => Promise.resolve({
        sources: [{ file: "src/current.ts", sourceText: functions }],
        skippedFiles: 0,
        cancelled: false,
      }),
      readSource: () => Promise.resolve(functions),
    };
    const discover = new DiscoverAnchorRepairs(
      new TypeScriptAnchorAdapter(),
      new DefaultTourAnchorRegistryResolver([registry]),
      catalog,
    );

    const discovery = await discover.execute(TourScope.Repository, "target.return");

    assert.equal(discovery.targets[0]?.proposal.symbol, "target");
    assert.equal(discovery.targets[0]?.proposal.refinement, "return[0]");
  });
});

const originalSource = "export function login(email: string) { return verify(email); }";

async function createServices(sourceCatalog: AnchorSourceCatalog): Promise<{
  discover: DiscoverAnchorRepairs;
  repair: RepairAnchor;
  registry: RepositoryTourAnchorRegistry;
}> {
  const registry = new RepositoryTourAnchorRegistry(
    new InMemoryFileSystem(),
    new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
  );
  await registry.saveAnchor({
    id: "auth.login",
    file: "src/auth.ts",
    symbol: "missing",
    snapshot: createAnchorSnapshot(originalSource),
  });
  const adapter = new TypeScriptAnchorAdapter();
  const resolver = new DefaultTourAnchorRegistryResolver([registry]);
  return {
    discover: new DiscoverAnchorRepairs(adapter, resolver, sourceCatalog),
    repair: new RepairAnchor(adapter, resolver, sourceCatalog),
    registry,
  };
}
