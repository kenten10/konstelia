import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CreateTour } from "../src/application/tours/CreateTour";
import { TourScope } from "../src/domain/tour/TourScope";
import type { TourStorageProvider } from "../src/application/tours/TourStorage";
import { DefaultTourStorageResolver } from "../src/infrastructure/storage/TourStorageResolver";
import { PersonalTourStorageProvider } from "../src/infrastructure/storage/PersonalTourStorageProvider";
import { InMemoryFileSystem, uri } from "./fakes";

describe("CreateTour", () => {
  it("selects storage through TourScope and creates a unique ID", async () => {
    const fileSystem = new InMemoryFileSystem();
    const storage = new PersonalTourStorageProvider(fileSystem, uri("mem:/global"));
    await storage.saveTour({ id: "my-tour", title: "Existing", steps: [] });
    const resolver = new DefaultTourStorageResolver([storage]);

    const result = await new CreateTour(resolver).execute({
      scope: TourScope.Personal,
      title: "My Tour",
    });

    assert.equal(result.tour.id, "my-tour-2");
    assert.equal(result.location.scope, TourScope.Personal);
  });

  it("does not bypass the selected storage provider", async () => {
    let saves = 0;
    const provider: TourStorageProvider = {
      scope: TourScope.Repository,
      listTours: () => Promise.resolve([]),
      scanTours: () => Promise.resolve([]),
      loadTour: () => Promise.resolve(undefined),
      deleteTour: () => Promise.resolve(),
      saveTour: (tour) => {
        saves += 1;
        return Promise.resolve({ scope: TourScope.Repository, uri: `mem:/${tour.id}` });
      },
      updateTour: () => Promise.reject(new Error("Not used.")),
      renameTour: () => Promise.reject(new Error("Not used.")),
    };

    await new CreateTour(new DefaultTourStorageResolver([provider])).execute({
      scope: TourScope.Repository,
      title: "Repository Tour",
    });

    assert.equal(saves, 1);
  });
});
