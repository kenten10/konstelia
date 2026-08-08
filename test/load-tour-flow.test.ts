import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LoadTourDraft } from "../src/application/tours/LoadTourDraft";
import { LoadTourFlow } from "../src/application/tours/LoadTourFlow";
import type { TourAnchorRegistryResolver } from "../src/application/tours/TourAnchorRegistry";
import { AnchorHealth, type TourAnchor } from "../src/domain/tour/TourAnchor";
import type { TourDocument } from "../src/domain/tour/TourDocument";
import { TourScope } from "../src/domain/tour/TourScope";
import { TypeScriptAnchorAdapter } from "../src/infrastructure/language/TypeScriptAnchorAdapter";
import type { StoredTourFile, TourStorageProvider } from "../src/infrastructure/storage/TourStorageProvider";
import type { TourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import { uri } from "./fakes";

const source = `export class AuthService {
  authenticate() {
    return true;
  }
}
`;

const tour: TourDocument = {
  id: "auth-api",
  title: "Auth API",
  steps: [{
    id: "login",
    title: "Login",
    hops: [{
      summary: "authenticate",
      anchors: [
        { ref: "auth.authenticate", emphasis: "primary" },
        { ref: "auth.missing", emphasis: "secondary" },
      ],
    }],
  }],
};

const anchors: readonly TourAnchor[] = [
  { id: "auth.authenticate", file: "src/auth.ts", symbol: "AuthService.authenticate" },
  { id: "auth.drifted", file: "src/auth.ts", symbol: "AuthService.authenticate", refinement: "if[3]" },
  { id: "auth.unrelated", file: "src/other.ts", symbol: "missing" },
];

function storedTour(document: TourDocument): StoredTourFile {
  return {
    location: {
      scope: TourScope.Repository,
      uri: uri(`mem:/repo/.konstelia/tours/${document.id}.tour.yaml`),
    },
    tour: document,
    issues: [],
  };
}

function createDependencies(files: readonly StoredTourFile[], readFiles: string[] = []) {
  const storage = {
    scope: TourScope.Repository,
    saveTour: () => Promise.reject(new Error("Not used.")),
    updateTour: () => Promise.reject(new Error("Not used.")),
    loadTour: (id: string) => Promise.resolve(files.find((file) => file.tour?.id === id)?.tour),
    listTours: () => Promise.resolve([]),
    scanTours: () => Promise.resolve([...files]),
    deleteTour: () => Promise.resolve(),
  } as TourStorageProvider;
  const storageResolver: TourStorageResolver = { resolve: () => storage };
  const registryResolver = {
    resolve: () => ({
      scope: TourScope.Repository,
      loadAnchors: () => Promise.resolve([...anchors]),
      saveAnchor: () => Promise.resolve(),
      replaceAnchor: () => Promise.resolve(),
    }),
  } as TourAnchorRegistryResolver;
  const sourceReader = {
    readSource: (file: string) => {
      readFiles.push(file);
      return Promise.resolve(source);
    },
  };
  return { storageResolver, registryResolver, sourceReader };
}

describe("LoadTourFlow", () => {
  it("reports registry gaps as broken and resolved anchors as healthy", async () => {
    const { storageResolver, registryResolver, sourceReader } = createDependencies([storedTour(tour)]);

    const snapshot = await new LoadTourFlow(
      storageResolver,
      registryResolver,
      sourceReader,
      new TypeScriptAnchorAdapter(),
    ).execute(TourScope.Repository, "auth-api");

    assert.equal(snapshot.anchorHealth.get("auth.authenticate"), AnchorHealth.Healthy);
    assert.equal(snapshot.anchorHealth.get("auth.missing"), AnchorHealth.Broken);
  });

  it("reports an anchor whose refinement no longer resolves", async () => {
    const drifted: TourDocument = {
      ...tour,
      steps: [{
        id: "login",
        title: "Login",
        hops: [{ summary: "drifted", anchors: [{ ref: "auth.drifted", emphasis: "primary" }] }],
      }],
    };
    const { storageResolver, registryResolver, sourceReader } = createDependencies([storedTour(drifted)]);

    const snapshot = await new LoadTourFlow(
      storageResolver,
      registryResolver,
      sourceReader,
      new TypeScriptAnchorAdapter(),
    ).execute(TourScope.Repository, "auth-api");

    assert.equal(snapshot.anchorHealth.get("auth.drifted"), AnchorHealth.Drifted);
  });

  it("reads only the sources the tour references", async () => {
    const readFiles: string[] = [];
    const { storageResolver, registryResolver, sourceReader } = createDependencies(
      [storedTour(tour)],
      readFiles,
    );

    await new LoadTourFlow(
      storageResolver,
      registryResolver,
      sourceReader,
      new TypeScriptAnchorAdapter(),
    ).execute(TourScope.Repository, "auth-api");

    assert.deepEqual(readFiles, ["src/auth.ts"]);
  });

  it("fails when the tour does not exist", async () => {
    const { storageResolver, registryResolver, sourceReader } = createDependencies([]);

    await assert.rejects(
      () => new LoadTourFlow(
        storageResolver,
        registryResolver,
        sourceReader,
        new TypeScriptAnchorAdapter(),
      ).execute(TourScope.Repository, "auth-api"),
      /was not found in repository storage/,
    );
  });
});

describe("LoadTourDraft", () => {
  const other: TourDocument = {
    id: "overview",
    title: "Overview",
    steps: [{
      id: "intro",
      title: "Intro",
      hops: [{ summary: "intro", anchors: [{ ref: "auth.authenticate", emphasis: "primary" }] }],
    }],
  };

  it("offers sorted anchors, link targets, and other tour ids", async () => {
    const { storageResolver, registryResolver } = createDependencies([
      storedTour(tour),
      storedTour(other),
    ]);

    const draft = await new LoadTourDraft(storageResolver, registryResolver)
      .execute(TourScope.Repository, "auth-api");

    assert.equal(draft.tour.id, "auth-api");
    assert.deepEqual(draft.anchors.map((anchor) => anchor.id), [
      "auth.authenticate",
      "auth.drifted",
      "auth.unrelated",
    ]);
    assert.deepEqual(draft.tourIds, ["overview"]);
    assert.deepEqual(draft.stepTargets.map((target) => target.target), [
      "auth-api#login",
      "overview#intro",
    ]);
  });

  it("fails when the tour does not exist", async () => {
    const { storageResolver, registryResolver } = createDependencies([storedTour(other)]);

    await assert.rejects(
      () => new LoadTourDraft(storageResolver, registryResolver)
        .execute(TourScope.Repository, "auth-api"),
      /was not found in repository storage/,
    );
  });
});
