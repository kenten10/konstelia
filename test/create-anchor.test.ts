import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateAnchor } from "../src/application/anchors/CreateAnchor";
import { DefaultTourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import { TourScope } from "../src/domain/tour/TourScope";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";
import { RepositoryTourAnchorRegistry } from "../src/infrastructure/storage/RepositoryTourAnchorRegistry";
import { SingleRootWorkspaceLocator } from "../src/infrastructure/storage/RepositoryRootLocator";
import { InMemoryFileSystem, uri } from "./fakes";

describe("CreateAnchor", () => {
  it("proposes a semantic target and persists its snapshot through TourScope", async () => {
    const source = "export function login() { return authenticate(); }\n";
    const selected = "authenticate()";
    const start = source.indexOf(selected);
    const fileSystem = new InMemoryFileSystem();
    const registry = new RepositoryTourAnchorRegistry(
      fileSystem,
      new SingleRootWorkspaceLocator(() => [uri("mem:/repo")]),
    );
    const service = new CreateAnchor(
      new TypeScriptAnchorAdapter(),
      new DefaultTourAnchorRegistryResolver([registry]),
    );

    const proposal = service.propose({
      file: "src/login.ts",
      sourceText: source,
      selectionStart: start,
      selectionEnd: start + selected.length,
    });
    const anchor = await service.save(TourScope.Repository, proposal.suggestedId, proposal);

    assert.equal(anchor.symbol, "login");
    assert.equal(anchor.refinement, "call(authenticate)[0]");
    assert.match(anchor.snapshot?.hash ?? "", /^sha256:/);
    assert.deepEqual(await registry.loadAnchors(), [anchor]);
  });
});
