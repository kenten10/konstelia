import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RenameTour } from "../src/application/tours/RenameTour";
import { TourScope } from "../src/domain/tour/TourScope";
import { PersonalTourStorageProvider } from "../src/infrastructure/storage/PersonalTourStorageProvider";
import { DefaultTourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import type { TourStorageResolver } from "../src/application/tours/TourStorage";
import { InMemoryFileSystem, uri } from "./fakes";

async function createProject() {
  const fileSystem = new InMemoryFileSystem();
  const provider = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
  await provider.saveTour({
    id: "overview",
    title: "Overview",
    steps: [{
      id: "intro",
      title: "Intro",
      hops: [{ summary: "intro", anchors: [{ ref: "a", emphasis: "primary" }] }],
      links: [{ to: "auth-api#login", label: "認証を読む" }],
    }],
  });
  await provider.saveTour({
    id: "auth-api",
    title: "Auth API",
    prerequisites: ["overview"],
    steps: [{
      id: "login",
      title: "Login",
      hops: [{ summary: "login", anchors: [{ ref: "a", emphasis: "primary" }] }],
    }],
  });
  await provider.saveTour({
    id: "internals",
    title: "Internals",
    prerequisites: ["auth-api"],
    steps: [],
  });
  const resolver: TourStorageResolver = new DefaultTourStorageResolver([provider]);
  return { fileSystem, provider, renameTour: new RenameTour(resolver) };
}

describe("RenameTour", () => {
  it("reports which tours point at the one being renamed", async () => {
    const { renameTour } = await createProject();

    const plan = await renameTour.plan(TourScope.Personal, "auth-api");

    assert.equal(plan.title, "Auth API");
    assert.deepEqual([...plan.referencedBy].sort(), ["internals", "overview"]);
  });

  it("moves the file and rewrites prerequisites and links", async () => {
    const { fileSystem, provider, renameTour } = await createProject();

    await renameTour.execute(TourScope.Personal, "auth-api", "authentication");

    assert.equal(await provider.loadTour("auth-api"), undefined);
    assert.equal((await provider.loadTour("authentication"))?.title, "Auth API");
    assert.deepEqual(
      [...fileSystem.files.keys()].sort(),
      [
        "mem:/global/tours/authentication.tour.yaml",
        "mem:/global/tours/internals.tour.yaml",
        "mem:/global/tours/overview.tour.yaml",
      ],
    );
    assert.deepEqual((await provider.loadTour("internals"))?.prerequisites, ["authentication"]);
    assert.equal(
      (await provider.loadTour("overview"))?.steps[0]?.links?.[0]?.to,
      "authentication#login",
    );
  });

  it("keeps prerequisites that name another tour untouched", async () => {
    const { provider, renameTour } = await createProject();

    await renameTour.execute(TourScope.Personal, "auth-api", "authentication");

    assert.deepEqual((await provider.loadTour("authentication"))?.prerequisites, ["overview"]);
  });

  it("refuses an id another tour already uses", async () => {
    const { provider, renameTour } = await createProject();

    await assert.rejects(
      renameTour.execute(TourScope.Personal, "auth-api", "overview"),
      /already used in personal storage/,
    );

    assert.equal((await provider.loadTour("auth-api"))?.title, "Auth API");
    assert.equal((await provider.loadTour("overview"))?.title, "Overview");
  });

  it("refuses an empty id and accepts a no-op rename", async () => {
    const { provider, renameTour } = await createProject();

    await assert.rejects(renameTour.execute(TourScope.Personal, "auth-api", "  "), /required/);
    await renameTour.execute(TourScope.Personal, "auth-api", "auth-api");

    assert.equal((await provider.loadTour("auth-api"))?.title, "Auth API");
  });

  it("fails when the tour does not exist", async () => {
    const { renameTour } = await createProject();

    await assert.rejects(
      renameTour.execute(TourScope.Personal, "ghost", "spirit"),
      /was not found in personal storage/,
    );
  });
});
